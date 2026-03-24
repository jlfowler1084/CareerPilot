import { useState, useCallback, useRef } from "react";

const SEARCH_PROFILES = [
  { id: "sysadmin_local", label: "Sys Admin — Indy", keyword: "systems administrator", location: "Indianapolis, IN", source: "both", icon: "🖥️" },
  { id: "syseng_local", label: "Systems Engineer — Indy", keyword: "systems engineer Windows", location: "Indianapolis, IN", source: "both", icon: "⚙️" },
  { id: "devops_local", label: "DevOps / Cloud — Indy", keyword: "DevOps cloud engineer Azure", location: "Indianapolis, IN", source: "both", icon: "☁️" },
  { id: "powershell_remote", label: "PowerShell / Automation — Remote", keyword: "PowerShell automation engineer", location: "remote", source: "both", icon: "📜" },
  { id: "infra_remote", label: "Infrastructure — Remote", keyword: "Windows server VMware infrastructure", location: "remote", source: "dice", icon: "🏗️" },
  { id: "msp_local", label: "MSP / IT Services — Indy", keyword: "managed services IT engineer", location: "Indianapolis, IN", source: "indeed", icon: "🔧" },
  { id: "contract_infra", label: "Contract — Infrastructure", keyword: "Windows server VMware infrastructure", location: "Indianapolis, IN", source: "dice_contract", icon: "📋" },
  { id: "ad_identity", label: "Active Directory / Identity — Remote", keyword: "Active Directory engineer identity", location: "remote", source: "dice", icon: "🔐" },
  { id: "li_syseng_indy", label: "LinkedIn Sys Engineer — Indy", keyword: "Systems Engineer", location: "Indianapolis, Indiana, United States", source: "linkedin", icon: "🔗", linkedinGeoId: "100871315" },
  { id: "li_infra_remote", label: "LinkedIn Infrastructure — Remote", keyword: "Infrastructure Engineer Windows VMware", location: "United States", source: "linkedin", icon: "🔗", linkedinGeoId: "103644278", linkedinRemote: true },
  { id: "li_devops_indy", label: "LinkedIn DevOps — Indy", keyword: "DevOps Engineer Azure", location: "Indianapolis, Indiana, United States", source: "linkedin", icon: "🔗", linkedinGeoId: "100871315" },
  { id: "li_sysadmin_indy", label: "LinkedIn Sys Admin — Indy", keyword: "Systems Administrator", location: "Indianapolis, Indiana, United States", source: "linkedin", icon: "🔗", linkedinGeoId: "100871315" },
];

function parseIndeedResults(text) {
  const jobs = [];
  const blocks = text.split(/\*\*Job Title:\*\*/);
  for (const block of blocks) {
    if (!block.trim()) continue;
    const title = block.split("\n")[0]?.trim();
    const companyMatch = block.match(/\*\*Company:\*\*\s*(.+)/);
    const locationMatch = block.match(/\*\*Location:\*\*\s*(.+)/);
    const salaryMatch = block.match(/\*\*Compensation:\*\*\s*(.+)/);
    const urlMatch = block.match(/\*\*View Job URL:\*\*\s*(https?:\/\/[^\s]+)/);
    const postedMatch = block.match(/\*\*Posted on:\*\*\s*(.+)/);
    const typeMatch = block.match(/\*\*Job Type:\*\*\s*(.+)/);
    if (title) {
      jobs.push({
        title,
        company: companyMatch?.[1]?.trim() || "Unknown",
        location: locationMatch?.[1]?.trim() || "",
        salary: salaryMatch?.[1]?.trim() || "Not listed",
        url: urlMatch?.[1]?.trim() || "",
        posted: postedMatch?.[1]?.trim() || "",
        type: typeMatch?.[1]?.trim() || "",
        source: "Indeed",
      });
    }
  }
  return jobs;
}

function parseDiceResults(text) {
  const jobs = [];
  try {
    const jsonMatch = text.match(/\{[\s\S]*"data"\s*:\s*\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0] + "}");
      if (parsed.data) {
        for (const job of parsed.data) {
          jobs.push({
            title: job.title || "",
            company: job.companyName || "Unknown",
            location: job.jobLocation?.displayName || (job.isRemote ? "Remote" : ""),
            salary: job.salary || "Not listed",
            url: job.detailsPageUrl || "",
            posted: job.postedDate ? new Date(job.postedDate).toLocaleDateString() : "",
            type: job.employmentType || "",
            source: "Dice",
            easyApply: job.easyApply,
          });
        }
      }
    }
  } catch (e) {
    // fallback: try line-by-line parse
    const lines = text.split("\n");
    let current = {};
    for (const line of lines) {
      if (line.includes('"title"')) {
        const m = line.match(/"title"\s*:\s*"([^"]+)"/);
        if (m) current.title = m[1];
      }
      if (line.includes('"companyName"')) {
        const m = line.match(/"companyName"\s*:\s*"([^"]+)"/);
        if (m) current.company = m[1];
      }
      if (line.includes("detailsPageUrl")) {
        const m = line.match(/"detailsPageUrl"\s*:\s*"([^"]+)"/);
        if (m) {
          current.url = m[1];
          current.source = "Dice";
          if (current.title) jobs.push({ ...current });
          current = {};
        }
      }
    }
  }
  return jobs;
}

const API_URL = "https://api.anthropic.com/v1/messages";

async function searchIndeed(keyword, location) {
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: "You are a job search assistant. Use the Indeed MCP tool to search for jobs. Return the raw results exactly as the tool provides them. Do not add commentary.",
      messages: [{ role: "user", content: `Search Indeed for "${keyword}" jobs in "${location}" in the US. Return all results.` }],
      mcp_servers: [{ type: "url", url: "https://mcp.indeed.com/claude/mcp", name: "indeed" }],
    }),
  });
  const data = await resp.json();
  const allText = data.content?.map(b => {
    if (b.type === "text") return b.text;
    if (b.type === "mcp_tool_result") return b.content?.map(c => c.text || "").join("\n") || "";
    return "";
  }).join("\n") || "";
  return parseIndeedResults(allText);
}

async function searchDice(keyword, location, contractOnly = false) {
  const filterNote = contractOnly ? " Filter for contract positions only." : "";
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: "You are a job search assistant. Use the Dice MCP tool to search for jobs. Return the raw tool results exactly as provided in JSON format. Do not add commentary or reformatting.",
      messages: [{ role: "user", content: `Search Dice for "${keyword}" jobs near "${location}" within 50 miles. Return 10 results.${filterNote} Return the raw JSON.` }],
      mcp_servers: [{ type: "url", url: "https://mcp.dice.com/mcp", name: "dice" }],
    }),
  });
  const data = await resp.json();
  const allText = data.content?.map(b => {
    if (b.type === "text") return b.text;
    if (b.type === "mcp_tool_result") return b.content?.map(c => c.text || "").join("\n") || "";
    return "";
  }).join("\n") || "";
  return parseDiceResults(allText);
}

function buildLinkedInSearchUrl(profile) {
  const params = [
    `keywords=${encodeURIComponent(profile.keyword)}`,
    `geoId=${profile.linkedinGeoId}`,
    "sortBy=R",
  ];
  if (profile.linkedinRemote) {
    params.push("f_WT=2");
  }
  return `https://www.linkedin.com/jobs/search/?${params.join("&")}`;
}

function searchLinkedIn(profile) {
  const url = buildLinkedInSearchUrl(profile);
  window.open(url, "_blank");
  return [{
    title: `LinkedIn Search: ${profile.keyword}`,
    company: "Opened in browser",
    location: profile.location,
    salary: "Not listed",
    url,
    posted: new Date().toLocaleDateString(),
    type: "",
    source: "LinkedIn",
  }];
}

function JobCard({ job }) {
  const sourceColor = job.source === "Indeed" ? "#2557a7" : job.source === "LinkedIn" ? "#0a66c2" : "#0c7ff2";
  return (
    <div style={{
      background: "var(--card-bg)",
      border: "1px solid var(--border)",
      borderLeft: `4px solid ${sourceColor}`,
      borderRadius: 8,
      padding: "16px 20px",
      marginBottom: 10,
      transition: "transform 0.15s, box-shadow 0.15s",
      cursor: "pointer",
    }}
    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)"; }}
    onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
    onClick={() => job.url && window.open(job.url, "_blank")}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: "var(--text-primary)", marginBottom: 4, lineHeight: 1.3 }}>
            {job.title}
          </div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: "var(--text-secondary)", marginBottom: 6 }}>
            {job.company}{job.location ? ` · ${job.location}` : ""}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {job.salary && job.salary !== "Not listed" && (
              <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", padding: "2px 8px", borderRadius: 4, background: "var(--tag-salary-bg)", color: "var(--tag-salary-text)", fontWeight: 500 }}>
                {job.salary}
              </span>
            )}
            {job.type && job.type !== "N/A" && (
              <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", padding: "2px 8px", borderRadius: 4, background: "var(--tag-type-bg)", color: "var(--tag-type-text)" }}>
                {job.type}
              </span>
            )}
            {job.easyApply && (
              <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", padding: "2px 8px", borderRadius: 4, background: "#e8f5e9", color: "#2e7d32" }}>
                Easy Apply
              </span>
            )}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, fontFamily: "'DM Mono', monospace",
            padding: "2px 8px", borderRadius: 4,
            background: sourceColor, color: "#fff", letterSpacing: "0.5px",
          }}>
            {job.source}
          </span>
          {job.posted && (
            <span style={{ fontSize: 10, color: "var(--text-muted)", fontFamily: "'DM Mono', monospace" }}>{job.posted}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export default function JobSearchDashboard() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});
  const [selectedProfiles, setSelectedProfiles] = useState(new Set(["sysadmin_local", "syseng_local", "contract_infra", "li_syseng_indy"]));
  const [searchComplete, setSearchComplete] = useState(false);
  const [totalSearched, setTotalSearched] = useState(0);
  const abortRef = useRef(false);

  const toggleProfile = useCallback((id) => {
    setSelectedProfiles(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = () => setSelectedProfiles(new Set(SEARCH_PROFILES.map(p => p.id)));
  const selectNone = () => setSelectedProfiles(new Set());

  const runSearch = useCallback(async () => {
    abortRef.current = false;
    setResults([]);
    setErrors({});
    setSearchComplete(false);
    setTotalSearched(0);
    const profiles = SEARCH_PROFILES.filter(p => selectedProfiles.has(p.id));
    const newLoading = {};
    profiles.forEach(p => { newLoading[p.id] = true; });
    setLoading(newLoading);

    let allResults = [];
    let searched = 0;

    for (const profile of profiles) {
      if (abortRef.current) break;
      try {
        let jobs = [];
        if (profile.source === "indeed") {
          jobs = await searchIndeed(profile.keyword, profile.location);
        } else if (profile.source === "dice") {
          jobs = await searchDice(profile.keyword, profile.location);
        } else if (profile.source === "dice_contract") {
          jobs = await searchDice(profile.keyword, profile.location, true);
        } else if (profile.source === "linkedin") {
          jobs = searchLinkedIn(profile);
        } else {
          // both
          const [indeedJobs, diceJobs] = await Promise.all([
            searchIndeed(profile.keyword, profile.location).catch(() => []),
            searchDice(profile.keyword, profile.location).catch(() => []),
          ]);
          jobs = [...indeedJobs, ...diceJobs];
        }
        jobs = jobs.map(j => ({ ...j, profileId: profile.id, profileLabel: profile.label }));
        allResults = [...allResults, ...jobs];
        setResults([...allResults]);
        setErrors(prev => ({ ...prev, [profile.id]: null }));
      } catch (err) {
        setErrors(prev => ({ ...prev, [profile.id]: err.message }));
      }
      searched++;
      setTotalSearched(searched);
      setLoading(prev => ({ ...prev, [profile.id]: false }));
    }
    setSearchComplete(true);
  }, [selectedProfiles]);

  const stopSearch = () => { abortRef.current = true; };

  // Deduplicate by title + company
  const seen = new Set();
  const dedupedResults = results.filter(j => {
    const key = `${j.title}|||${j.company}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Filter out obviously irrelevant jobs
  const filteredResults = dedupedResults.filter(j => {
    const t = (j.title || "").toLowerCase();
    return !t.includes("pest control") && !t.includes("hvac") && !t.includes("construction project") && !t.includes("transportation engineer") && !t.includes("mechanical") && !t.includes("civil engineer") && !t.includes("epc project");
  });

  const isAnyLoading = Object.values(loading).some(v => v);
  const activeProfiles = SEARCH_PROFILES.filter(p => selectedProfiles.has(p.id));

  return (
    <div style={{
      minHeight: "100vh",
      background: "var(--bg)",
      fontFamily: "'DM Sans', sans-serif",
      color: "var(--text-primary)",
      padding: 0,
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=DM+Mono:wght@400;500&display=swap');
        :root {
          --bg: #f5f5f0;
          --card-bg: #ffffff;
          --border: #e0ddd5;
          --text-primary: #1a1a18;
          --text-secondary: #5c5c56;
          --text-muted: #8c8c84;
          --accent: #b35a00;
          --accent-light: #fff3e6;
          --tag-salary-bg: #e8f0e4;
          --tag-salary-text: #3a6b28;
          --tag-type-bg: #e6ecf5;
          --tag-type-text: #2c4a7c;
          --header-bg: #1a1a18;
          --header-text: #f5f5f0;
        }
        @media (prefers-color-scheme: dark) {
          :root {
            --bg: #141413;
            --card-bg: #1e1e1c;
            --border: #2e2e2a;
            --text-primary: #e8e8e2;
            --text-secondary: #a0a098;
            --text-muted: #6c6c64;
            --accent: #e07820;
            --accent-light: #2a1f14;
            --tag-salary-bg: #1a2814;
            --tag-salary-text: #7cc462;
            --tag-type-bg: #141e2e;
            --tag-type-text: #6ea4e0;
            --header-bg: #0a0a09;
            --header-text: #e8e8e2;
          }
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .profile-chip {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: 6px; font-size: 13px;
          font-weight: 500; cursor: pointer; transition: all 0.15s;
          border: 1.5px solid var(--border); background: var(--card-bg);
          color: var(--text-secondary); user-select: none;
        }
        .profile-chip.active {
          border-color: var(--accent); background: var(--accent-light);
          color: var(--accent); font-weight: 700;
        }
        .profile-chip:hover { border-color: var(--accent); }
        .run-btn {
          padding: 12px 32px; border-radius: 8px; border: none;
          background: var(--accent); color: #fff; font-size: 15px;
          font-weight: 700; font-family: 'DM Sans', sans-serif;
          cursor: pointer; transition: all 0.15s; letter-spacing: 0.3px;
        }
        .run-btn:hover { filter: brightness(1.1); transform: translateY(-1px); }
        .run-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .stop-btn {
          padding: 12px 24px; border-radius: 8px; border: 2px solid #c0392b;
          background: transparent; color: #c0392b; font-size: 14px;
          font-weight: 700; font-family: 'DM Sans', sans-serif;
          cursor: pointer; transition: all 0.15s;
        }
        .stop-btn:hover { background: #c0392b; color: #fff; }
        .spinner {
          display: inline-block; width: 14px; height: 14px;
          border: 2px solid var(--border); border-top-color: var(--accent);
          border-radius: 50%; animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .result-item { animation: fadeIn 0.25s ease-out; }
      `}</style>

      {/* Header */}
      <div style={{
        background: "var(--header-bg)", color: "var(--header-text)",
        padding: "28px 32px 24px", borderBottom: "3px solid var(--accent)",
      }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--accent)", marginBottom: 6 }}>
            Job Search Command Center
          </div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0, letterSpacing: -0.5 }}>
            Joseph Fowler — IT Search Dashboard
          </h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", marginTop: 6, fontFamily: "'DM Mono', monospace" }}>
            Indeed + Dice + LinkedIn · Sheridan, IN + Remote · Last run: {new Date().toLocaleDateString()}
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 24px 60px" }}>

        {/* Search Profiles */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: "var(--text-primary)" }}>Search Profiles</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={selectAll} style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", background: "none", border: "1px solid var(--border)", borderRadius: 4, padding: "4px 10px", cursor: "pointer", color: "var(--text-secondary)" }}>All</button>
              <button onClick={selectNone} style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", background: "none", border: "1px solid var(--border)", borderRadius: 4, padding: "4px 10px", cursor: "pointer", color: "var(--text-secondary)" }}>None</button>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {SEARCH_PROFILES.map(p => (
              <div
                key={p.id}
                className={`profile-chip ${selectedProfiles.has(p.id) ? "active" : ""}`}
                onClick={() => toggleProfile(p.id)}
              >
                <span>{p.icon}</span>
                <span>{p.label}</span>
                {loading[p.id] && <span className="spinner" />}
              </div>
            ))}
          </div>
        </div>

        {/* Run Button */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 28 }}>
          <button
            className="run-btn"
            onClick={runSearch}
            disabled={isAnyLoading || selectedProfiles.size === 0}
          >
            {isAnyLoading ? `Searching... (${totalSearched}/${activeProfiles.length})` : `Run Search (${selectedProfiles.size} profiles)`}
          </button>
          {isAnyLoading && (
            <button className="stop-btn" onClick={stopSearch}>Stop</button>
          )}
        </div>

        {/* Status bar */}
        {(isAnyLoading || searchComplete) && (
          <div style={{
            background: "var(--card-bg)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "12px 16px", marginBottom: 20,
            fontFamily: "'DM Mono', monospace", fontSize: 12,
            display: "flex", justifyContent: "space-between", color: "var(--text-secondary)",
          }}>
            <span>{filteredResults.length} unique jobs found{searchComplete ? " ✓" : ""}</span>
            <span>{filteredResults.filter(j => j.source === "Indeed").length} Indeed · {filteredResults.filter(j => j.source === "Dice").length} Dice · {filteredResults.filter(j => j.source === "LinkedIn").length} LinkedIn</span>
          </div>
        )}

        {/* Error display */}
        {Object.entries(errors).filter(([,e]) => e).map(([id, err]) => (
          <div key={id} style={{ background: "#fdf0ef", border: "1px solid #e8c4c0", borderRadius: 6, padding: "8px 12px", marginBottom: 8, fontSize: 12, color: "#9b3b30" }}>
            ⚠️ {SEARCH_PROFILES.find(p => p.id === id)?.label}: {err}
          </div>
        ))}

        {/* Results */}
        {filteredResults.length > 0 && (
          <div>
            {filteredResults.map((job, i) => (
              <div key={`${job.title}-${job.company}-${i}`} className="result-item">
                <JobCard job={job} />
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {!isAnyLoading && searchComplete && filteredResults.length === 0 && (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 15, fontWeight: 500 }}>No results found</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Try selecting different search profiles</div>
          </div>
        )}

        {/* Initial state */}
        {!isAnyLoading && !searchComplete && results.length === 0 && (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
            <div style={{ fontSize: 15, fontWeight: 500 }}>Select your search profiles and hit Run</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Results stream in as each profile completes</div>
          </div>
        )}

        {/* Disclaimer */}
        <div style={{
          marginTop: 32, padding: "12px 16px", borderRadius: 6,
          background: "var(--accent-light)", border: "1px solid var(--border)",
          fontSize: 11, color: "var(--text-muted)", fontFamily: "'DM Mono', monospace", lineHeight: 1.5,
        }}>
          These job listings are retrieved using AI-powered search via Indeed, Dice, and LinkedIn. LinkedIn profiles open browser tabs for manual search. Please review all job details carefully and verify information directly with employers before applying.
        </div>
      </div>
    </div>
  );
}
