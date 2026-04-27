"""Job search keyword/location profiles for LinkedIn searches.

Note: The SEARCH_PROFILES dict (Dice/Indeed profiles) was removed in CAR-188.
Profiles are now stored in Supabase's ``search_profiles`` table and managed
via ``src.jobs.search_engine.run_profiles()``.  The legacy
``JobSearcher.run_profiles()`` in ``src/jobs/searcher.py`` is deprecated.

``LINKEDIN_SEARCH_PROFILES`` remains here for future v2 LinkedIn scope (CAR-189).
"""

# LinkedIn search profiles — used for browser-based job search and alert setup.
# These use LinkedIn's geo_id system (not free-text location like Dice).
LINKEDIN_SEARCH_PROFILES = {
    "syseng_indy": {
        "label": "Systems Engineer — Indianapolis",
        "keywords": "Systems Engineer",
        "location": "Indianapolis, Indiana, United States",
        "geo_id": "100871315",
    },
    "infra_remote": {
        "label": "Infrastructure Engineer — Remote",
        "keywords": "Infrastructure Engineer Windows VMware",
        "location": "United States",
        "geo_id": "103644278",
        "remote": True,
    },
    "devops_indy": {
        "label": "DevOps Engineer — Indianapolis",
        "keywords": "DevOps Engineer Azure",
        "location": "Indianapolis, Indiana, United States",
        "geo_id": "100871315",
    },
    "it_eng_indy": {
        "label": "IT Engineer — Indianapolis",
        "keywords": "IT Engineer",
        "location": "Indianapolis, Indiana, United States",
        "geo_id": "100871315",
    },
    "sysadmin_indy": {
        "label": "Systems Administrator — Indianapolis",
        "keywords": "Systems Administrator",
        "location": "Indianapolis, Indiana, United States",
        "geo_id": "100871315",
    },
    "powershell_remote": {
        "label": "PowerShell / Automation — Remote",
        "keywords": "PowerShell Automation Engineer",
        "location": "United States",
        "geo_id": "103644278",
        "remote": True,
    },
}
