"""Job search keyword/location profiles for Indeed, Dice, and LinkedIn searches."""

# sources: "dice" = Dice only (default for now)
# Indeed MCP requires Claude.ai connector auth and is not yet supported via direct API.
# Once Indeed auth is resolved, profiles can be changed back to "both" or "indeed".
SEARCH_PROFILES = {
    "sysadmin_local": {
        "label": "Systems Administrator (Indianapolis)",
        "keyword": "systems administrator",
        "location": "Indianapolis, IN",
        "remote": False,
        "sources": "dice",
    },
    "syseng_local": {
        "label": "Systems Engineer Windows (Indianapolis)",
        "keyword": "systems engineer Windows",
        "location": "Indianapolis, IN",
        "remote": False,
        "sources": "dice",
    },
    "devops_local": {
        "label": "DevOps / Cloud Engineer Azure (Indianapolis)",
        "keyword": "DevOps cloud engineer Azure",
        "location": "Indianapolis, IN",
        "remote": False,
        "sources": "dice",
    },
    "powershell_remote": {
        "label": "PowerShell Automation Engineer (Remote)",
        "keyword": "PowerShell automation engineer",
        "location": "remote",
        "remote": True,
        "sources": "dice",
    },
    "infra_remote": {
        "label": "Windows Server VMware Infrastructure (Remote)",
        "keyword": "Windows server VMware infrastructure",
        "location": "remote",
        "remote": True,
        "sources": "dice",
    },
    "msp_local": {
        "label": "Managed Services IT Engineer (Indianapolis)",
        "keyword": "managed services IT engineer",
        "location": "Indianapolis, IN",
        "remote": False,
        "sources": "dice",
    },
    "contract_infra": {
        "label": "Windows Server VMware Infrastructure Contract (Indianapolis)",
        "keyword": "Windows server VMware infrastructure",
        "location": "Indianapolis, IN",
        "remote": False,
        "sources": "dice",
        "contract_only": True,
    },
    "ad_identity": {
        "label": "Active Directory / Identity Engineer (Remote)",
        "keyword": "Active Directory engineer identity",
        "location": "remote",
        "remote": True,
        "sources": "dice",
    },
}

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
