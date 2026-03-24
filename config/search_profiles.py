"""Job search keyword/location profiles for Indeed and Dice searches."""

SEARCH_PROFILES = {
    "sysadmin_local": {
        "keyword": "Systems Administrator",
        "location": "Indianapolis, IN",
        "remote": False,
    },
    "syseng_local": {
        "keyword": "Systems Engineer",
        "location": "Indianapolis, IN",
        "remote": False,
    },
    "devops_local": {
        "keyword": "DevOps Engineer",
        "location": "Indianapolis, IN",
        "remote": False,
    },
    "powershell_remote": {
        "keyword": "PowerShell Engineer",
        "location": "",
        "remote": True,
    },
    "infra_remote": {
        "keyword": "Infrastructure Engineer",
        "location": "",
        "remote": True,
    },
    "msp_local": {
        "keyword": "MSP Engineer",
        "location": "Indianapolis, IN",
        "remote": False,
    },
    "contract_infra": {
        "keyword": "Infrastructure Engineer Contract",
        "location": "Indianapolis, IN",
        "remote": False,
        "contract_only": True,
    },
    "ad_identity": {
        "keyword": "Active Directory Identity Engineer",
        "location": "",
        "remote": True,
    },
}
