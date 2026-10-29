"""Remove only the known starter address; never invent a company location."""
SAMPLE_ADDRESS = "Plot 42, Pharma Industrial Estate, Ahmedabad, Gujarat 382210, India"


def company_profile(company):
    result = dict(company or {})
    if str(result.get("address") or "").strip().casefold() == SAMPLE_ADDRESS.casefold():
        result["address"] = ""
    return result


async def remove_sample_company_address(database):
    company = await database.settings.find_one({"id": "company"})
    if company and company_profile(company).get("address") != company.get("address"):
        # Compare the exact old value so a concurrent Admin correction wins.
        await database.settings.update_one({"id": "company", "address": company["address"]},
                                           {"$set": {"address": ""}})
