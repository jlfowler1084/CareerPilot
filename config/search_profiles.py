"""Job search keyword/location profiles for Indeed and Dice searches."""

# sources: "both" = Indeed + Dice, "indeed" = Indeed only, "dice" = Dice only
SEARCH_PROFILES = {
    "sysadmin_local": {
        "label": "Systems Administrator (Indianapolis)",
        "keyword": "systems administrator",
        "location": "Indianapolis, IN",
        "remote": False,
        "sources": "both",
    },
    "syseng_local": {
        "label": "Systems Engineer Windows (Indianapolis)",
        "keyword": "systems engineer Windows",
        "location": "Indianapolis, IN",
        "remote": False,
        "sources": "both",
    },
    "devops_local": {
        "label": "DevOps / Cloud Engineer Azure (Indianapolis)",
        "keyword": "DevOps cloud engineer Azure",
        "location": "Indianapolis, IN",
        "remote": False,
        "sources": "both",
    },
    "powershell_remote": {
        "label": "PowerShell Automation Engineer (Remote)",
        "keyword": "PowerShell automation engineer",
        "location": "remote",
        "remote": True,
        "sources": "both",
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
        "sources": "indeed",
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
