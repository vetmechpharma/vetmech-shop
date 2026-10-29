from copy import deepcopy
import pytest
from security import create_token

OWNER={'Authorization':'Bearer '+create_token('owner','admin')}
LIMITED={'Authorization':'Bearer '+create_token('limited','admin')}
CATALOG={'Authorization':'Bearer '+create_token('catalog','admin')}
CUSTOMER={'Authorization':'Bearer '+create_token('a','customer')}

async def seed(db):
    await db.admin_users.insert_many([{'id':'owner','role':'super_admin','active':True},{'id':'limited','role':'custom','permissions':['customers'],'active':True},{'id':'catalog','role':'product_manager','active':True}])
    await db.customers.insert_many([{'id':cid,'name':cid.upper(),'mobile':mobile,'status':'deleted' if cid=='deleted' else 'active','created_at':'2026-10-01T10:00:00Z',
                                    'password_hash':'PRIVATE-HASH','password':'PRIVATE-PASSWORD','verification_token':'PRIVATE-TOKEN','addresses':[{'line1':'Clinic','password':'PRIVATE-NESTED'}]} for cid,mobile in [('a','9000000001'),('b','9000000002'),('deleted','9000000003')]])
    for cid in ['a','b']:
        await db.orders.insert_one({'id':'o-'+cid,'customer_id':cid,'order_number':'ORDER-'+cid,'status':'closed','sales_value':100.25,'created_at':'2026-10-20T19:00:00Z',
                                    'items':[{'product_name':'Product '+cid,'variant_id':'v','qty':3,'pack_size':'100 ml','unit':'Bottle'}],
                                    'activity':[{'at':'2026-10-21T12:00:00Z','text':'Order confirmed','actor':'Owner'}],
                                    'invoice':{'id':'i-'+cid,'invoice_number':'INV-'+cid,'invoice_date':'2026-10-21','amount_paise':10025,'status':'posted','created_at':'2026-10-21T13:00:00Z'},
                                    'pending_items':[{'id':'p-'+cid,'variant_id':'v','product_name':'Product '+cid,'pack_size':'100 ml','unit':'Bottle','requested_qty':2,'state':'available','created_at':'2026-10-21T11:00:00Z','available_at':'2026-10-22T12:00:00Z','availability_notice_status':'sent'}]})
        await db.ledger_entries.insert_one({'id':'pay-'+cid,'customer_id':cid,'entry_type':'payment','amount_paise':2500,'status':'confirmed','mode':'UPI','transaction_id':'REF-'+cid,'transaction_date':'2026-10-22','created_at':'2026-10-22T13:00:00Z'})
        await db.quotations.insert_one({'id':'q-'+cid,'customer_id':cid,'number':'QUOTE-'+cid,'grand_total':99,'status':'sent','created_at':'2026-10-20T01:00:00Z','history':[]})
    await db.ledger_entries.insert_many([{'id':'opening:a','customer_id':'a','entry_type':'opening','direction':'debit','amount_paise':1000,'status':'posted','transaction_date':'2026-10-01','created_at':'2026-10-01T12:00:00Z'},
                                       {'id':'pending-a','customer_id':'a','entry_type':'payment','amount_paise':500,'status':'pending','transaction_date':'2026-10-23','created_at':'2026-10-23T13:00:00Z'}])
    await db.audit_logs.insert_one({'id':'audit-a','entity':'customer','entity_id':'a','action':'status_change','actor_name':'Owner','created_at':'2026-10-22T15:00:00Z','meta':{'status':'active','password_hash':'PRIVATE-AUDIT','token':'PRIVATE-AUDIT-TOKEN'}})


def get(client,cid='a',**params):
    response=client.get('/api/admin/customers/'+cid+'/360',params=params,headers=OWNER)
    assert response.status_code==200,response.text
    return response.json()


@pytest.mark.asyncio
async def test_360_is_customer_scoped_read_only_and_uses_ledger_totals(client,database):
    await seed(database)
    before={name:deepcopy(await database[name].find({}).to_list(None)) for name in await database.list_collection_names()}
    data=get(client,limit=100)
    assert data['summary']['orders']==1 and data['summary']['ordered_value_paise']==10025
    assert data['summary']['ledger']['balance_paise']==8525 and data['summary']['ledger']['pending_payments']==1
    assert data['summary']['pending_items']==1
    assert data['frequent_products'][0]['qty']==3
    serialized=str(data)
    assert not any(value in serialized for value in ['PRIVATE-','ORDER-b','INV-b','QUOTE-b','REF-b'])
    assert any(row['kind']=='invoice' for row in data['items'])
    assert any(row['title']=='Stock received · Product a' for row in data['items'])
    after={name:await database[name].find({}).to_list(None) for name in await database.list_collection_names()}
    assert after==before


@pytest.mark.asyncio
async def test_history_paginates_beyond_the_old_200_order_limit_and_filters_local_dates(client,database):
    await seed(database)
    await database.orders.insert_many([{'id':f'extra-{i}','customer_id':'a','order_number':f'EXTRA-{i}','status':'new','sales_value':1,'created_at':'2026-10-20T10:00:00Z','items':[]} for i in range(205)])
    data=get(client,section='orders',page=3,limit=100)
    assert data['total']==206 and len(data['items'])==6 and data['summary']['orders']==206
    filtered=get(client,section='timeline',kind='order',q='ORDER-a',date_from='2026-10-21',date_to='2026-10-21')
    assert any(row['title']=='Order created · ORDER-a' for row in filtered['items'])  # 19:00Z belongs to the next India date.
    assert all(row['date']=='2026-10-21' for row in filtered['items'])
    assert client.get('/api/admin/customers/a/360',params={'date_from':'2026-10-22','date_to':'2026-10-01'},headers=OWNER).status_code==400
    assert client.get('/api/admin/customers/a/360',params={'limit':101},headers=OWNER).status_code==422


@pytest.mark.asyncio
async def test_cancelled_orders_and_resolved_missed_items_remain_history_without_active_demand(client,database):
    await seed(database)
    await database.orders.insert_one({'id':'cancelled','customer_id':'a','order_number':'CANCELLED','status':'cancelled','sales_value':5000,'created_at':'2026-10-22T10:00:00Z','items':[{'product_name':'Cancelled product','qty':999}],
                                      'pending_items':[{'id':'cancel-p','variant_id':'x','product_name':'Cancelled product','requested_qty':999,'state':'waiting','created_at':'2026-10-22T10:00:00Z'}]})
    await database.orders.update_one({'id':'o-a'},{'$set':{'pending_items.0.state':'resolved','pending_items.0.resolved_at':'2026-10-24T10:00:00Z'}})
    data=get(client,section='pending')
    assert data['total']==2 and {row['status'] for row in data['items']}=={'resolved','cancelled'}
    assert data['summary']['pending_items']==0 and data['summary']['ordered_value_paise']==10025
    assert all(row['name']!='Cancelled product' for row in data['frequent_products'])


@pytest.mark.asyncio
async def test_permissions_do_not_leak_restricted_order_or_quotation_data(client,database):
    await seed(database)
    assert client.get('/api/admin/customers/a/360').status_code==401
    assert client.get('/api/admin/customers/a/360',headers=CUSTOMER).status_code==401
    assert client.get('/api/admin/customers/a/360',headers=CATALOG).status_code==403
    data=client.get('/api/admin/customers/a/360',headers=LIMITED).json()
    assert data['permissions']['orders'] is False and data['counts']['orders'] is None
    assert data['frequent_products']==[] and 'orders' not in data['summary']
    assert not any(row['kind'] in ['order','pending','quotation'] for row in data['items'])
    assert client.get('/api/admin/customers/a/360',params={'section':'orders'},headers=LIMITED).status_code==403
    assert data['summary']['ledger']['balance_paise']==8525  # Existing customer permission already permits the ledger.


@pytest.mark.asyncio
async def test_deleted_and_new_customers_open_without_invented_history(client,database):
    await seed(database)
    data=get(client,'deleted')
    assert data['customer']['status']=='deleted' and data['summary']['orders']==0
    assert data['summary']['ledger']['balance_paise']==0
    assert data['total']==1  # Recorded account creation, not synthetic order/payment activity.
    assert client.get('/api/admin/customers/missing/360',headers=OWNER).status_code==404
    assert client.post('/api/admin/customers/a/360',headers=OWNER,json={}).status_code==405
