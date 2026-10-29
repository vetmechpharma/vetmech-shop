import json
import re
from html.parser import HTMLParser

import pytest

from company_profile import SAMPLE_ADDRESS, remove_sample_company_address


class Page(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.tags = []
        self.feed(html)
        self.structured = [json.loads(value) for value in re.findall(r'<script type="application/ld\+json">(.*?)</script>', html)]

    def handle_starttag(self, tag, attrs):
        self.tags.append((tag, dict(attrs)))

    def meta(self, name):
        return next(attrs['content'] for tag, attrs in self.tags if tag == 'meta' and name in (attrs.get('name'), attrs.get('property')))


@pytest.fixture(autouse=True)
def origin(monkeypatch):
    monkeypatch.setenv('SITE_URL', 'https://vetmechpharma.in')


@pytest.mark.asyncio
async def test_google_home_receives_brand_icon_name_and_visible_images(client, database):
    await database.settings.insert_one({'id': 'company', 'name': 'VETMECH PHARMACEUTICALS PRIVATE LIMITED', 'address': SAMPLE_ADDRESS})
    await database.settings.insert_one({'id': 'homepage', 'corporate': {'hero': {'image': '/corporate/animal-care.webp'}}})
    await database.products.insert_one({'id': 'p', 'active': True, 'name': 'Actual Product', 'slug': 'actual-product', 'image': '/api/uploads/actual.webp'})
    result = client.get('/api/seo/render', params={'path': '/'})
    page = Page(result.text)
    assert ('link', {'rel': 'icon', 'type': 'image/png', 'sizes': '96x96', 'href': 'https://vetmechpharma.in/corporate/favicon.png'}) in page.tags
    website = next(node for node in page.structured if node['@type'] == 'WebSite')
    assert website['name'] == 'VETMECH Pharmaceuticals'
    assert 'VETMECH' in website['alternateName']
    assert page.meta('og:site_name') == website['name']
    org = next(node for node in page.structured if node['@type'] == 'Organization')
    assert 'address' not in org
    images = [attrs['src'] for tag, attrs in page.tags if tag == 'img']
    assert 'https://vetmechpharma.in/corporate/animal-care.webp' in images
    assert 'https://vetmechpharma.in/api/uploads/actual.webp' in images
    assert SAMPLE_ADDRESS not in result.text


@pytest.mark.asyncio
async def test_product_photo_is_visible_and_linked_without_public_prices_or_fake_reviews(client, database):
    await database.products.insert_one({'id': 'p', 'active': True, 'name': 'Product "A" <100 ml>', 'slug': 'actual-product',
                                       'image': '/api/uploads/photo.webp', 'variants': [{'pack_size': '100 ml', 'mrp': 987654}]})
    result = client.get('/api/seo/render', params={'path': '/products/actual-product'})
    page = Page(result.text)
    image = next(attrs for tag, attrs in page.tags if tag == 'img')
    assert image['src'] == 'https://vetmechpharma.in/api/uploads/photo.webp'
    assert image['alt'] == 'Product "A" <100 ml>'
    product = next(node for node in page.structured if node['@type'] == 'Product')
    webpage = next(node for node in page.structured if node['@type'] == 'WebPage')
    assert webpage['primaryImageOfPage']['url'] == product['image'] == image['src']
    assert webpage['mainEntity']['@id'] == product['@id']
    assert product['mainEntityOfPage'] == 'https://vetmechpharma.in/products/actual-product'
    assert not any(key in product for key in ['offers', 'aggregateRating', 'review'])
    assert '987654' not in result.text
    assert page.meta('robots') == 'index, follow, max-image-preview:large'


@pytest.mark.asyncio
async def test_contact_has_its_own_description_and_real_contact_details(client, database):
    await database.settings.insert_many([
        {'id': 'seo', 'default_description': 'Generic homepage description'},
        {'id': 'company', 'name': 'VETMECH', 'address': 'Verified customer-entered office address', 'phone': '+91 9944472488', 'email': 'contact@example.test'}])
    response = client.get('/api/seo/render', params={'path': '/contact'})
    assert 'Generic homepage description' not in response.text
    assert 'Contact VETMECH Pharmaceuticals' in Page(response.text).meta('description')
    assert '<address>' in response.text and 'Verified customer-entered office address' in response.text
    assert '+91 9944472488' in response.text and 'contact@example.test' in response.text
    await database.pages.insert_one({'slug': 'contact', 'seo': {'meta_description': 'Approved custom contact description'}})
    custom = client.get('/api/seo/render', params={'path': '/contact'})
    assert Page(custom.text).meta('description') == 'Approved custom contact description'


@pytest.mark.asyncio
async def test_sample_cleanup_is_idempotent_and_preserves_a_genuine_address(client, database):
    await database.settings.insert_one({'id': 'company', 'address': SAMPLE_ADDRESS, 'phone': 'keep', 'email': 'keep@example.test'})
    assert client.get('/api/settings/company').json()['address'] == ''
    await remove_sample_company_address(database)
    await remove_sample_company_address(database)
    stored = await database.settings.find_one({'id': 'company'})
    assert stored['address'] == '' and stored['phone'] == 'keep' and stored['email'] == 'keep@example.test'
    await database.settings.update_one({'id': 'company'}, {'$set': {'address': 'Verified company address'}})
    await remove_sample_company_address(database)
    assert client.get('/api/settings/company').json()['address'] == 'Verified company address'
    page = Page(client.get('/api/seo/render', params={'path': '/'}).text)
    org = next(node for node in page.structured if node['@type'] == 'Organization')
    assert org['address']['streetAddress'] == 'Verified company address'


@pytest.mark.asyncio
@pytest.mark.parametrize('robots', ['noindex, follow', 'index, follow, max-image-preview:none', 'nosnippet', 'noimageindex'])
async def test_existing_search_restrictions_are_preserved(client, database, robots):
    await database.pages.insert_one({'slug': 'about', 'seo': {'robots': robots}})
    assert Page(client.get('/api/seo/render', params={'path': '/about'}).text).meta('robots') == robots
