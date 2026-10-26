// Platform field metadata observed 2026-10-21; no business defaults or entity IDs.
export const EXTENDED_FIELDS = {
  "account": {
    "company_headcount": {
      "label": "Company headcount",
      "ui": "Company headcount",
      "query_type": "COMPANY_HEADCOUNT",
      "source": "enum",
      "modes": [
        "include"
      ]
    },
    "headquarters_location": {
      "label": "Headquarters location",
      "ui": "Region",
      "query_type": "REGION",
      "source": "entity",
      "modes": [
        "include",
        "exclude"
      ],
      "placeholder": "Add locations"
    },
    "industry": {
      "label": "Industry",
      "ui": "Industry",
      "query_type": "INDUSTRY",
      "source": "entity",
      "modes": [
        "include",
        "exclude"
      ],
      "placeholder": "Add industries"
    },
    "number_of_followers": {
      "label": "Number of followers",
      "ui": "Number of followers",
      "query_type": "NUM_OF_FOLLOWERS",
      "source": "enum",
      "modes": [
        "include"
      ]
    },
    "fortune": {
      "label": "Fortune",
      "ui": "Fortune",
      "query_type": "FORTUNE",
      "source": "enum",
      "modes": [
        "include"
      ]
    },
    "job_opportunities": {
      "label": "Job opportunities",
      "ui": "Job opportunities",
      "query_type": "JOB_OPPORTUNITIES",
      "source": "enum",
      "modes": [
        "include"
      ]
    },
    "recent_activities": {
      "label": "Recent activities",
      "ui": "Recent activities",
      "query_type": "ACCOUNT_ACTIVITIES",
      "source": "enum",
      "modes": [
        "include"
      ]
    },
    "connection": {
      "label": "Connection",
      "ui": "Connection",
      "query_type": "RELATIONSHIP",
      "source": "enum",
      "modes": [
        "include"
      ]
    },
    "saved_accounts": {
      "label": "Saved accounts",
      "ui": "Saved accounts",
      "query_type": "SAVED_ACCOUNTS",
      "source": "enum",
      "modes": [
        "include"
      ]
    },
    "account_lists": {
      "label": "Account lists",
      "ui": "Account lists",
      "query_type": "ACCOUNT_LIST",
      "source": "enum",
      "modes": [
        "include",
        "exclude"
      ],
      "placeholder": "Search for custom account lists"
    }
  },
  "lead": {
    "current_company": {
      "label": "Current company",
      "ui": "Current company",
      "query_type": "CURRENT_COMPANY",
      "source": "entity",
      "modes": [
        "include",
        "exclude"
      ],
      "placeholder": "Add current companies and account lists"
    },
    "company_headcount": {
      "label": "Company headcount",
      "ui": "Company headcount",
      "query_type": "COMPANY_HEADCOUNT",
      "source": "enum",
      "modes": [
        "include"
      ]
    },
    "past_company": {
      "label": "Past company",
      "ui": "Past company",
      "query_type": "PAST_COMPANY",
      "source": "entity",
      "modes": [
        "include",
        "exclude"
      ],
      "placeholder": "Add past companies and account lists"
    },
    "company_type": {
      "label": "Company type",
      "ui": "Company type",
      "query_type": "COMPANY_TYPE",
      "source": "enum",
      "modes": [
        "include"
      ]
    },
    "company_headquarters_location": {
      "label": "Company headquarters location",
      "ui": "Company headquarters location",
      "query_type": "COMPANY_HEADQUARTERS",
      "source": "entity",
      "modes": [
        "include",
        "exclude"
      ],
      "placeholder": "Add locations"
    },
    "function": {
      "label": "Function",
      "ui": "Function",
      "query_type": "FUNCTION",
      "source": "enum",
      "modes": [
        "include",
        "exclude"
      ],
      "placeholder": "Add functions"
    },
    "title": {
      "label": "Current job title",
      "ui": "Current job title",
      "query_type": "CURRENT_TITLE",
      "source": "entity",
      "modes": [
        "include"
      ],
      "placeholder": "Add current titles"
    },
    "seniority": {
      "label": "Seniority level",
      "ui": "Seniority level",
      "query_type": "SENIORITY_LEVEL",
      "source": "enum",
      "modes": [
        "include",
        "exclude"
      ]
    },
    "past_title": {
      "label": "Past job title",
      "ui": "Past job title",
      "query_type": "PAST_TITLE",
      "source": "entity",
      "modes": [
        "include"
      ],
      "placeholder": "Add past titles"
    },
    "years_in_current_company": {
      "label": "Years in current company",
      "ui": "Years in current company",
      "query_type": "YEARS_AT_CURRENT_COMPANY",
      "source": "enum",
      "modes": [
        "include"
      ]
    },
    "years_in_current_position": {
      "label": "Years in current position",
      "ui": "Years in current position",
      "query_type": "YEARS_IN_CURRENT_POSITION",
      "source": "enum",
      "modes": [
        "include"
      ]
    },
    "industry": {
      "label": "Industry",
      "ui": "Industry",
      "query_type": "INDUSTRY",
      "source": "entity",
      "modes": [
        "include",
        "exclude"
      ],
      "placeholder": "Add industries"
    },
    "profile_language": {
      "label": "Profile language",
      "ui": "Profile language",
      "query_type": "PROFILE_LANGUAGE",
      "source": "enum",
      "modes": [
        "include"
      ]
    },
    "years_of_experience": {
      "label": "Years of experience",
      "ui": "Years of experience",
      "query_type": "YEARS_OF_EXPERIENCE",
      "source": "enum",
      "modes": [
        "include"
      ]
    },
    "groups": {
      "label": "Groups",
      "ui": "Groups",
      "query_type": "GROUP",
      "source": "entity",
      "modes": [
        "include"
      ],
      "placeholder": "Add groups"
    },
    "school": {
      "label": "School",
      "ui": "School",
      "query_type": "SCHOOL",
      "source": "entity",
      "modes": [
        "include"
      ],
      "placeholder": "Add schools"
    },
    "connection": {
      "label": "Connection",
      "ui": "Connection",
      "query_type": "RELATIONSHIP",
      "source": "enum",
      "modes": [
        "include"
      ]
    },
    "connections_of": {
      "label": "Connections of",
      "ui": "Connections of",
      "query_type": "CONNECTION_OF",
      "source": "entity",
      "modes": [
        "include"
      ],
      "placeholder": "Search for your connection"
    },
    "persona": {
      "label": "Persona",
      "ui": "Persona",
      "query_type": "PERSONA",
      "source": "enum",
      "modes": [
        "include"
      ]
    },
    "account_lists": {
      "label": "Account lists",
      "ui": "Account lists",
      "query_type": "ACCOUNT_LIST",
      "source": "enum",
      "modes": [
        "include",
        "exclude"
      ],
      "placeholder": "Search for custom account lists"
    },
    "lead_lists": {
      "label": "Lead lists",
      "ui": "Lead lists",
      "query_type": "LEAD_LIST",
      "source": "enum",
      "modes": [
        "include",
        "exclude"
      ],
      "placeholder": "Search for custom lead lists"
    },
    "people_interacted_with": {
      "label": "People you interacted with",
      "ui": "People you interacted with",
      "query_type": "LEAD_INTERACTIONS",
      "source": "enum",
      "modes": [
        "include",
        "exclude"
      ]
    },
    "saved_leads_and_accounts": {
      "label": "Saved leads and accounts",
      "ui": "Saved leads and accounts",
      "query_type": "SAVED_LEADS_AND_ACCOUNTS",
      "source": "enum",
      "modes": [
        "include",
        "exclude"
      ]
    },
    "geography": {
      "label": "Geography",
      "ui": "Region",
      "query_type": "REGION",
      "source": "entity",
      "modes": [
        "include",
        "exclude"
      ],
      "placeholder": "Add locations"
    }
  }
};
