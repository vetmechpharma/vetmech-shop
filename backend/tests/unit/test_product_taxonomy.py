import pytest
from catalog_taxonomy import ensure_animal_categories
from security import create_token

async def setup(database):
    await ensure_animal_categories(database)
    await database.admin_users.insert_one({"id":"owner","role":"super_admin","active":True})
    return {"Authorization":"Bearer "+create_token("owner","admin")}

@pytest.mark.asyncio
async def test_defaults_migrate_without_losing_links_or_legacy_assignments(database):
    await database.categories.insert_many([{"id":"large","name":"Large Animal","slug":"large-animal","parent_id":None,"active":True,"seo":{"title":"Keep SEO"}}, {"id":"unknown","name":"Old Therapeutics","slug":"old","parent_id":"none","active":True}, {"id":"sub","name":"Oral","parent_id":"large","active":True}])
    await database.products.insert_one({"id":"p","category_id":"large","category_ids":["large","unknown"],"subcategory_ids":["sub"],"variants":[{"id":"v","mrp":42}]})
    await ensure_animal_categories(database)
    mains=await database.categories.find({"fixed_main":True}).to_list(None)
    assert {c["name"] for c in mains}=={"Ruminants","Companion Pets","Poultry","Pig","Horses","Exotic Birds"}
    root=await database.categories.find_one({"id":"large"})
    assert root["slug"]=="large-animal" and root["seo"]["title"]=="Keep SEO"
    p=await database.products.find_one({"id":"p"})
    assert p["category_ids"]==["large"] and p["subcategory_ids"]==["sub"]
    assert p["legacy_category_ids"]==["unknown"] and p["variants"][0]["mrp"]==42
    await database.categories.update_one({"id":"large"},{"$set":{"description":"edited"}})
    await ensure_animal_categories(database)
    assert await database.categories.count_documents({"fixed_main":True})==6
    assert (await database.categories.find_one({"id":"large"}))["description"]=="edited"

@pytest.mark.asyncio
async def test_category_policy_and_multi_assignment_round_trip(client,database):
    headers=await setup(database)
    assert client.post('/api/admin/categories',headers=headers,json={"name":"Seventh root"}).status_code==400
    mains=(await database.categories.find({"fixed_main":True}).to_list(None))
    r=next(c for c in mains if c['name']=='Ruminants')['id'];pig=next(c for c in mains if c['name']=='Pig')['id']
    assert client.delete('/api/admin/categories/'+r,headers=headers).status_code==400
    assert client.put('/api/admin/categories/'+r,headers=headers,json={'name':'Changed'}).status_code==400
    assert client.put('/api/admin/categories/'+r,headers=headers,json={'description':'Real description'}).status_code==200
    subs=[client.post('/api/admin/categories',headers=headers,json={'name':name,'parent_id':parent}).json()['id'] for name,parent in [('Oral',r),('Feed',pig)]]
    result=client.post('/api/admin/products',headers=headers,json={'name':'Shared product','category_ids':[r,pig,r],'subcategory_ids':subs,'variants':[{'id':'v','mrp':100}]}).json()
    assert result['category_ids']==[r,pig] and result['subcategory_ids']==subs
    pid=result['id']
    assert client.put('/api/admin/products/'+pid,headers=headers,json={'category_ids':[r],'subcategory_ids':subs}).status_code==400
    cleared=client.put('/api/admin/products/'+pid,headers=headers,json={'category_ids':[pig],'subcategory_ids':[]}).json()
    assert cleared['category_ids']==[pig] and cleared['category_id']==pig
    assert cleared['subcategory_ids']==[] and cleared['subcategory_id'] is None
    for category in [r,pig]:
        got=client.get('/api/products',params={'category':category}).json()['items']
        assert (pid in [p['id'] for p in got]) == (category==pig)
    assert client.post('/api/admin/categories',headers=headers,json={'name':'Nested','parent_id':subs[0]}).status_code==400

@pytest.mark.asyncio
async def test_deleting_product_hides_it_but_preserves_order_and_pricing_history(client,database):
    headers=await setup(database)
    await database.products.insert_one({'id':'p','name':'Product','slug':'p','active':True,'variants':[]})
    history={'id':'o','items':[{'product_id':'p','product_name':'Product','qty':2,'unit_price':42}]}
    await database.orders.insert_one(dict(history));await database.customer_prices.insert_one({'id':'cp','product_id':'p','rate':42})
    assert client.delete('/api/admin/products/p',headers=headers).status_code==200
    assert (await database.products.find_one({'id':'p'}))['active'] is False
    assert not client.get('/api/admin/products',headers=headers).json()['items']
    assert client.get('/api/products/p').status_code==404
    assert client.put('/api/admin/products/p',headers=headers,json={'active':True}).status_code==404
    assert (await database.orders.find_one({'id':'o'}))['items']==history['items']
    assert await database.customer_prices.count_documents({'id':'cp'})==1

@pytest.mark.asyncio
async def test_admin_category_and_name_filters_combine(client,database):
    headers=await setup(database)
    for pid,category in [('one','species-pig'),('two','species-ruminants')]:
        await database.products.insert_one({'id':pid,'name':'Shared','category_ids':[category]})
    assert [p['id'] for p in client.get('/api/admin/products',headers=headers,params={'category':'species-pig','q':'Shared'}).json()['items']]==['one']

@pytest.mark.asyncio
async def test_deleted_products_cannot_be_added_from_an_old_cart(database,monkeypatch):
    import routers.orders as orders
    from fastapi import HTTPException
    monkeypatch.setattr(orders,'db',database)
    await database.products.insert_one({'id':'deleted','deleted_at':'now','active':False,'variants':[{'id':'v'}]})
    with pytest.raises(HTTPException) as caught:
        await orders.resolve_cart([{'variant_id':'v','qty':1}])
    assert caught.value.status_code==400
