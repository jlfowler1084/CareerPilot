import { useState, useCallback, useRef, useEffect } from "react";

const STORAGE_KEY = "job-search-data";

const RESUME_TEXT = `JOSEPH FOWLER
Sheridan, IN | jlfowler1084@gmail.com | 443-787-6528 | linkedin.com/in/system-administration

PROFESSIONAL SUMMARY
Systems administrator and engineer with over two decades of experience managing enterprise server environments, supporting Windows and Microsoft 365 infrastructure, and improving operational reliability. Skilled in server commissioning, Windows OS administration and migration, VMware vSphere virtualization, Active Directory and Group Policy management, and PowerShell automation. Experienced with SolarWinds monitoring, SCCM patch management, Azure administration, and maintaining thorough documentation across the full server lifecycle. Known for clear communication, steady follow-through, and a practical approach to solving infrastructure problems. Increasingly focused on cloud technologies and infrastructure automation.

CORE SKILLS
PowerShell Scripting & Automation · Windows Server & Active Directory · VMware vSphere & PowerCLI · Microsoft 365 & Azure AD/Entra ID · Splunk & SolarWinds Monitoring · Networking (DNS, DHCP, VLAN, VPN) · Nimble SAN & Storage Management · SCCM & Group Policy Management · Azure Portal & VM Provisioning · Technical Support & Escalation Handling · Documentation, Runbooks & Knowledge Management · GitHub & Version Control

PROFESSIONAL EXPERIENCE

Venable LLP — Baltimore, MD
Systems Engineer · 2021 – October 2025
- Led server commissioning activities including deployment, configuration, and validation of physical and virtual servers in compliance with organizational standards and security policies.
- Planned and executed Windows OS refresh and migration projects, validating system functionality post-upgrade and resolving any post-migration issues.
- Administered Microsoft 365 licensing and tenant configuration alongside on-premises Exchange, supporting a hybrid messaging environment across the firm.
- Provisioned and managed resources in the Azure portal, including virtual machine deployment and Azure AD/Entra ID administration for identity and access management.
- Redesigned SolarWinds alerting configuration, meaningfully reducing noise and false positives and improving team response times to genuine incidents.
- Developed and deployed 30+ Splunk dashboards providing real-time analytics and operational visibility into critical infrastructure components.
- Automated a broad range of manual administrative tasks using PowerShell scripting, freeing up team time and improving workflow consistency.
- Designed and implemented custom Windows scheduled tasks with Splunk integration for comprehensive logging and performance tracking.
- Built a modular PowerShell scripting framework hosted in GitHub with detailed documentation to support maintainability and future scalability.
- Expanded and optimized Nimble SAN storage, provisioning LUNs and managing high-demand storage to support data availability requirements.
- Automated VMware PowerCLI tasks to accelerate virtual machine provisioning and routine maintenance across a 700+ VM environment.

Operations Analyst · 2018 – 2021
- Managed a 700+ server VMware vSphere environment, supporting uptime and compliance with security policies.
- Supported backup operations and disaster recovery planning for server infrastructure, ensuring data protection and continuity across the environment.
- Developed PowerShell scripts to automate user provisioning, log analysis, and patch management, substantially reducing manual workload.
- Strengthened Active Directory and Group Policy enforcement, ensuring consistent policy application across the enterprise.
- Revamped SolarWinds monitoring with dynamic alerting thresholds to proactively detect and surface infrastructure issues.
- Improved SCCM deployment strategies to enforce enterprise-wide patch compliance and support security hardening efforts.

Analyst, Technology Networks & Systems · 2014 – 2017
- Contributed to meaningful reductions in critical system downtime through proactive monitoring and automated alerting using SolarWinds and Splunk.
- Streamlined certificate lifecycle management, improving compliance and uptime for enterprise security systems.
- Upgraded and maintained network infrastructure, deploying Cisco routers, switches, and wireless access points to improve connectivity.
- Managed DNS, DHCP, VLAN auditing, and virtualization lifecycle activities to maintain network integrity.

Specialist, Technology Hardware Services · 2005 – 2013
- Provided tier-3 support for desktops, laptops, and mobile devices with a strong record of thorough resolution and follow-through.
- Assisted in the firm-wide Windows 7 rollout, ensuring smooth data migration and user transition across the organization.
- Performed new-hire setups, workstation installations, and equipment replacement activities.
- Created clear written instructions for hardware deployment, setup, and user guidance.

EDUCATION & CERTIFICATIONS
- Microsoft Azure Fundamentals (AZ-900) — In Progress
- ITIL V4 Foundations Certificate
- Security+, CompTIA
- Network Information Systems Certificate, Tesst College of Technology

TECHNICAL KNOWLEDGE
Operating Systems: Windows 10/11, Windows Server, Active Directory, VMware vSphere
Cloud & Identity: Microsoft 365 Administration, Azure Portal, Azure AD/Entra ID, Azure VM Deployment, Exchange Online (Hybrid)
Scripting & Automation: PowerShell, VMware PowerCLI, Python (Foundational)
Monitoring & Logging: Splunk, SolarWinds, ITSI
Networking: DNS, DHCP, VLAN, VPN, Cisco Routers & Switches
Storage: Nimble SAN, LUN Provisioning
Security & Compliance: ITIL, Security+, SCCM, Group Policy, SIEM
DevOps & Version Control: GitHub, PowerShell Modules, Git
Hardware: Workstations, laptops, printers, peripherals, mobile devices`;

const SEARCH_PROFILES = [
  { id: "sysadmin_local", label: "Sys Admin — Indy", keyword: "systems administrator", location: "Indianapolis, IN", source: "both", icon: "🖥️" },
  { id: "syseng_local", label: "Systems Engineer — Indy", keyword: "systems engineer Windows", location: "Indianapolis, IN", source: "both", icon: "⚙️" },
  { id: "devops_local", label: "DevOps / Cloud — Indy", keyword: "DevOps cloud engineer Azure", location: "Indianapolis, IN", source: "both", icon: "☁️" },
  { id: "powershell_remote", label: "PowerShell / Automation — Remote", keyword: "PowerShell automation engineer", location: "remote", source: "both", icon: "📜" },
  { id: "infra_remote", label: "Infrastructure — Remote", keyword: "Windows server VMware infrastructure", location: "remote", source: "dice", icon: "🏗️" },
  { id: "msp_local", label: "MSP / IT Services — Indy", keyword: "managed services IT engineer", location: "Indianapolis, IN", source: "indeed", icon: "🔧" },
  { id: "contract_infra", label: "Contract — Infrastructure", keyword: "Windows server VMware infrastructure", location: "Indianapolis, IN", source: "dice_contract", icon: "📋" },
  { id: "ad_identity", label: "Active Directory / Identity — Remote", keyword: "Active Directory engineer identity", location: "remote", source: "dice", icon: "🔐" },
];

const API_URL = "https://api.anthropic.com/v1/messages";

// ─── Parsing helpers ───────────────────────────────────────────────

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
    const applyMatch = block.match(/\*\*Apply URL:\*\*\s*(https?:\/\/[^\s]+)/);
    if (title) {
      jobs.push({
        title,
        company: companyMatch?.[1]?.trim() || "Unknown",
        location: locationMatch?.[1]?.trim() || "",
        salary: salaryMatch?.[1]?.trim() || "Not listed",
        url: urlMatch?.[1]?.trim() || "",
        applyUrl: applyMatch?.[1]?.trim() || "",
        posted: postedMatch?.[1]?.trim() || "",
        type: typeMatch?.[1]?.trim() || "",
        source: "Indeed",
        quickApply: !!(applyMatch?.[1]),
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
            applyUrl: job.detailsPageUrl || "",
            posted: job.postedDate ? new Date(job.postedDate).toLocaleDateString() : "",
            type: job.employmentType || "",
            source: "Dice",
            easyApply: job.easyApply,
            quickApply: !!job.easyApply,
          });
        }
      }
    }
  } catch (e) {
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

// ─── API calls ─────────────────────────────────────────────────────

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

async function fetchJobDetails(job) {
  if (job.source !== "Indeed" || !job.url) return null;
  try {
    const resp = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        system: "You are a job search assistant. Use the Indeed MCP tool to get job details. Return the complete job description text. Do not add commentary.",
        messages: [{ role: "user", content: `Get the full details for this Indeed job: "${job.title}" at "${job.company}". The job URL is: ${job.url}` }],
        mcp_servers: [{ type: "url", url: "https://mcp.indeed.com/claude/mcp", name: "indeed" }],
      }),
    });
    const data = await resp.json();
    const allText = data.content?.map(b => {
      if (b.type === "text") return b.text;
      if (b.type === "mcp_tool_result") return b.content?.map(c => c.text || "").join("\n") || "";
      return "";
    }).join("\n") || "";
    return allText.trim() || null;
  } catch {
    return null;
  }
}

async function tailorResume(job, jobDescription) {
  const desc = jobDescription || `${job.title} at ${job.company}. Location: ${job.location}. Type: ${job.type}. Salary: ${job.salary}.`;
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      system: `You are an expert resume writer for IT and systems administration professionals. You tailor resumes to specific job descriptions.

RULES:
- Keep all factual content truthful — do not invent experience, skills, or certifications the candidate doesn't have.
- Reorder bullet points to emphasize the most relevant experience first.
- Adjust the professional summary to align with the target role's language and priorities.
- Promote matching skills to the top of the Core Skills section.
- If the job mentions skills the candidate has but are understated, make them more prominent.
- Keep the same overall structure and formatting.
- Output the complete tailored resume as clean text, ready to be pasted into a document.
- Do NOT add any commentary before or after the resume — just output the resume text.`,
      messages: [{ role: "user", content: `Here is my current resume:\n\n${RESUME_TEXT}\n\n---\n\nHere is the job I'm applying to:\n\nTitle: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location}\n\nJob Description:\n${desc}\n\n---\n\nPlease tailor my resume for this specific position.` }],
    }),
  });
  const data = await resp.json();
  return data.content?.filter(b => b.type === "text").map(b => b.text).join("\n") || "Error generating tailored resume.";
}

async function generateCoverLetter(job, jobDescription) {
  const desc = jobDescription || `${job.title} at ${job.company}. Location: ${job.location}. Type: ${job.type}.`;
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2000,
      system: `You are an expert cover letter writer for IT and systems administration professionals.

RULES:
- Write a professional, personalized cover letter tailored to the specific job.
- Reference specific experience from the candidate's resume that matches the job requirements.
- Keep the tone confident and professional but not stuffy — the candidate is known for clear communication and practical problem-solving.
- Keep it concise: 3-4 paragraphs, under 400 words.
- Use the candidate's real contact info: Joseph Fowler, Sheridan IN, jlfowler1084@gmail.com, 443-787-6528.
- Do NOT add commentary — just output the cover letter text ready to send.
- Include today's date and proper letter formatting.`,
      messages: [{ role: "user", content: `Here is my resume:\n\n${RESUME_TEXT}\n\n---\n\nHere is the job I'm applying to:\n\nTitle: ${job.title}\nCompany: ${job.company}\nLocation: ${job.location}\n\nJob Description:\n${desc}\n\n---\n\nPlease write a cover letter for this position.` }],
    }),
  });
  const data = await resp.json();
  return data.content?.filter(b => b.type === "text").map(b => b.text).join("\n") || "Error generating cover letter.";
}

// ─── Persistent storage ────────────────────────────────────────────

async function saveSearchData(data) {
  try { await window.storage.set(STORAGE_KEY, JSON.stringify(data)); } catch (e) { console.error("Save failed:", e); }
}
async function loadSearchData() {
  try {
    const result = await window.storage.get(STORAGE_KEY);
    return result ? JSON.parse(result.value) : null;
  } catch { return null; }
}
async function clearSearchData() {
  try { await window.storage.delete(STORAGE_KEY); } catch (e) { console.error("Clear failed:", e); }
}

function timeAgo(isoString) {
  if (!isoString) return "";
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ─── Clipboard helper ──────────────────────────────────────────────

function useCopyFeedback() {
  const [copied, setCopied] = useState(null);
  const copy = async (text, id) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 2000);
    } catch { /* fallback */ }
  };
  return { copied, copy };
}

// ─── Components ────────────────────────────────────────────────────

function QuickApplyBadge({ job }) {
  if (!job.quickApply && !job.easyApply) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      fontSize: 11, fontFamily: "'DM Mono', monospace", fontWeight: 700,
      padding: "3px 10px", borderRadius: 20,
      background: "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)",
      color: "#fff", letterSpacing: "0.3px",
      boxShadow: "0 1px 4px rgba(34,197,94,0.3)",
    }}>
      ⚡ {job.easyApply ? "Easy Apply" : "Quick Apply"}
    </span>
  );
}

function JobCard({ job, isSelected, onClick }) {
  const sourceColor = job.source === "Indeed" ? "#2557a7" : "#0c7ff2";
  const hasQuickApply = job.quickApply || job.easyApply;
  return (
    <div style={{
      background: isSelected ? "var(--accent-light)" : "var(--card-bg)",
      border: isSelected ? "2px solid var(--accent)" : "1px solid var(--border)",
      borderLeft: `4px solid ${hasQuickApply ? "#22c55e" : sourceColor}`,
      borderRadius: 8,
      padding: "16px 20px",
      marginBottom: 10,
      transition: "transform 0.15s, box-shadow 0.15s",
      cursor: "pointer",
    }}
    onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.1)"; }}}
    onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = ""; }}
    onClick={onClick}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <div style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 15, color: "var(--text-primary)", lineHeight: 1.3 }}>
              {job.title}
            </div>
            <QuickApplyBadge job={job} />
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
            {job.profileLabel && (
              <span style={{ fontSize: 10, fontFamily: "'DM Mono', monospace", padding: "2px 8px", borderRadius: 4, background: "var(--accent-light)", color: "var(--text-muted)" }}>
                {job.profileLabel}
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

function ApplyPanel({ job, onClose }) {
  const [tab, setTab] = useState("details");
  const [jobDesc, setJobDesc] = useState(null);
  const [loadingDesc, setLoadingDesc] = useState(false);
  const [tailoredResume, setTailoredResume] = useState(null);
  const [loadingResume, setLoadingResume] = useState(false);
  const [coverLetter, setCoverLetter] = useState(null);
  const [loadingCover, setLoadingCover] = useState(false);
  const { copied, copy } = useCopyFeedback();

  useEffect(() => {
    if (job.source === "Indeed") {
      setLoadingDesc(true);
      fetchJobDetails(job).then(desc => {
        setJobDesc(desc);
        setLoadingDesc(false);
      });
    }
  }, [job.url]);

  const handleTailorResume = async () => {
    setLoadingResume(true);
    setTab("resume");
    const result = await tailorResume(job, jobDesc);
    setTailoredResume(result);
    setLoadingResume(false);
  };

  const handleGenerateCover = async () => {
    setLoadingCover(true);
    setTab("cover");
    const result = await generateCoverLetter(job, jobDesc);
    setCoverLetter(result);
    setLoadingCover(false);
  };

  const hasQuickApply = job.quickApply || job.easyApply;
  const sourceColor = job.source === "Indeed" ? "#2557a7" : "#0c7ff2";

  return (
    <div style={{
      position: "fixed", top: 0, right: 0, bottom: 0, width: "min(580px, 100vw)",
      background: "var(--bg)", borderLeft: "3px solid var(--accent)",
      boxShadow: "-8px 0 30px rgba(0,0,0,0.15)",
      zIndex: 1000, display: "flex", flexDirection: "column",
      animation: "slideIn 0.25s ease-out",
    }}>
      <style>{`@keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>

      {/* Panel header */}
      <div style={{
        padding: "20px 24px 16px", borderBottom: "1px solid var(--border)",
        background: "var(--card-bg)", flexShrink: 0,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div style={{ flex: 1, minWidth: 0, paddingRight: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, fontFamily: "'DM Mono', monospace",
                padding: "2px 8px", borderRadius: 4, background: sourceColor, color: "#fff",
              }}>{job.source}</span>
              <QuickApplyBadge job={job} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: "var(--text-primary)", lineHeight: 1.3, margin: 0 }}>
              {job.title}
            </h2>
            <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 4 }}>
              {job.company}{job.location ? ` · ${job.location}` : ""}
            </p>
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
              {job.salary && job.salary !== "Not listed" && (
                <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", padding: "3px 10px", borderRadius: 4, background: "var(--tag-salary-bg)", color: "var(--tag-salary-text)", fontWeight: 500 }}>
                  {job.salary}
                </span>
              )}
              {job.type && job.type !== "N/A" && (
                <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", padding: "3px 10px", borderRadius: 4, background: "var(--tag-type-bg)", color: "var(--tag-type-text)" }}>
                  {job.type}
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "1px solid var(--border)", borderRadius: 6,
            width: 36, height: 36, cursor: "pointer", fontSize: 18, color: "var(--text-muted)",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>✕</button>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(hasQuickApply || job.url) && (
            <button
              onClick={() => window.open(job.applyUrl || job.url, "_blank")}
              style={{
                padding: "10px 20px", borderRadius: 8, border: "none",
                background: hasQuickApply ? "linear-gradient(135deg, #22c55e 0%, #16a34a 100%)" : sourceColor,
                color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
                boxShadow: hasQuickApply ? "0 2px 8px rgba(34,197,94,0.3)" : "none",
              }}
            >
              {hasQuickApply ? "⚡ Quick Apply" : "View Listing"} ↗
            </button>
          )}
          <button onClick={handleTailorResume} disabled={loadingResume} style={{
            padding: "10px 20px", borderRadius: 8, border: "2px solid var(--accent)",
            background: tab === "resume" ? "var(--accent-light)" : "transparent",
            color: "var(--accent)", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
            cursor: loadingResume ? "wait" : "pointer", opacity: loadingResume ? 0.7 : 1,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            {loadingResume && <span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />}
            📄 Tailor Resume
          </button>
          <button onClick={handleGenerateCover} disabled={loadingCover} style={{
            padding: "10px 20px", borderRadius: 8, border: "2px solid var(--accent)",
            background: tab === "cover" ? "var(--accent-light)" : "transparent",
            color: "var(--accent)", fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
            cursor: loadingCover ? "wait" : "pointer", opacity: loadingCover ? 0.7 : 1,
            display: "flex", alignItems: "center", gap: 6,
          }}>
            {loadingCover && <span className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />}
            ✉️ Cover Letter
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: "flex", borderBottom: "1px solid var(--border)", background: "var(--card-bg)", flexShrink: 0,
      }}>
        {[
          { id: "details", label: "Job Details" },
          { id: "resume", label: "Tailored Resume", hasContent: !!tailoredResume || loadingResume },
          { id: "cover", label: "Cover Letter", hasContent: !!coverLetter || loadingCover },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, padding: "10px 12px", border: "none",
            borderBottom: tab === t.id ? "3px solid var(--accent)" : "3px solid transparent",
            background: "transparent",
            color: tab === t.id ? "var(--accent)" : "var(--text-muted)",
            fontWeight: tab === t.id ? 700 : 500,
            fontSize: 12, fontFamily: "'DM Mono', monospace",
            cursor: "pointer", position: "relative",
          }}>
            {t.label}
            {t.hasContent && t.id !== "details" && (
              <span style={{
                position: "absolute", top: 6, right: 12, width: 6, height: 6,
                borderRadius: "50%", background: "#22c55e",
              }} />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
        {tab === "details" && (
          <div>
            {loadingDesc && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--text-muted)", fontFamily: "'DM Mono', monospace", fontSize: 13, padding: "20px 0" }}>
                <span className="spinner" /> Fetching full job description...
              </div>
            )}
            {jobDesc ? (
              <div style={{
                fontFamily: "'DM Sans', sans-serif", fontSize: 14, lineHeight: 1.7,
                color: "var(--text-primary)", whiteSpace: "pre-wrap",
              }}>
                {jobDesc}
              </div>
            ) : !loadingDesc ? (
              <div style={{ color: "var(--text-muted)", fontFamily: "'DM Mono', monospace", fontSize: 13, padding: "20px 0", lineHeight: 1.8 }}>
                <p style={{ marginBottom: 12 }}>
                  {job.source === "Dice"
                    ? "Dice job descriptions are available on the listing page."
                    : "No detailed description available."}
                </p>
                <p>Click <strong style={{ color: "var(--text-secondary)" }}>"{hasQuickApply ? "Quick Apply" : "View Listing"}"</strong> above to see the full posting, or generate a tailored resume and cover letter based on the job title and metadata.</p>
              </div>
            ) : null}
          </div>
        )}

        {tab === "resume" && (
          <div>
            {loadingResume ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "40px 0", color: "var(--text-muted)" }}>
                <span className="spinner" style={{ width: 24, height: 24, borderWidth: 2.5 }} />
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13 }}>Tailoring resume for {job.company}...</span>
              </div>
            ) : tailoredResume ? (
              <div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12, gap: 8 }}>
                  <button onClick={() => copy(tailoredResume, "resume")} style={{
                    padding: "6px 16px", borderRadius: 6, border: "1px solid var(--border)",
                    background: copied === "resume" ? "#22c55e" : "var(--card-bg)",
                    color: copied === "resume" ? "#fff" : "var(--text-secondary)",
                    fontSize: 12, fontFamily: "'DM Mono', monospace", cursor: "pointer",
                    fontWeight: 600, transition: "all 0.15s",
                  }}>
                    {copied === "resume" ? "✓ Copied!" : "📋 Copy Resume"}
                  </button>
                </div>
                <div style={{
                  background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 8,
                  padding: "20px 24px", fontFamily: "'DM Sans', sans-serif",
                  fontSize: 13, lineHeight: 1.7, color: "var(--text-primary)", whiteSpace: "pre-wrap",
                }}>
                  {tailoredResume}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace", fontSize: 13 }}>
                Click <strong style={{ color: "var(--text-secondary)" }}>"Tailor Resume"</strong> above to generate a version customized for this role.
              </div>
            )}
          </div>
        )}

        {tab === "cover" && (
          <div>
            {loadingCover ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "40px 0", color: "var(--text-muted)" }}>
                <span className="spinner" style={{ width: 24, height: 24, borderWidth: 2.5 }} />
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 13 }}>Writing cover letter for {job.company}...</span>
              </div>
            ) : coverLetter ? (
              <div>
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12, gap: 8 }}>
                  <button onClick={() => copy(coverLetter, "cover")} style={{
                    padding: "6px 16px", borderRadius: 6, border: "1px solid var(--border)",
                    background: copied === "cover" ? "#22c55e" : "var(--card-bg)",
                    color: copied === "cover" ? "#fff" : "var(--text-secondary)",
                    fontSize: 12, fontFamily: "'DM Mono', monospace", cursor: "pointer",
                    fontWeight: 600, transition: "all 0.15s",
                  }}>
                    {copied === "cover" ? "✓ Copied!" : "📋 Copy Letter"}
                  </button>
                </div>
                <div style={{
                  background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 8,
                  padding: "20px 24px", fontFamily: "'DM Sans', sans-serif",
                  fontSize: 13, lineHeight: 1.8, color: "var(--text-primary)", whiteSpace: "pre-wrap",
                }}>
                  {coverLetter}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-muted)", fontFamily: "'DM Mono', monospace", fontSize: 13 }}>
                Click <strong style={{ color: "var(--text-secondary)" }}>"Cover Letter"</strong> above to generate one tailored for this position.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────

export default function JobSearchDashboard() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState({});
  const [errors, setErrors] = useState({});
  const [selectedProfiles, setSelectedProfiles] = useState(new Set(["sysadmin_local", "syseng_local", "contract_infra"]));
  const [searchComplete, setSearchComplete] = useState(false);
  const [totalSearched, setTotalSearched] = useState(0);
  const [lastScan, setLastScan] = useState(null);
  const [loadingStorage, setLoadingStorage] = useState(true);
  const [selectedJob, setSelectedJob] = useState(null);
  const [sortBy, setSortBy] = useState("default");
  const abortRef = useRef(false);
  const resultsRef = useRef([]);

  useEffect(() => {
    (async () => {
      const saved = await loadSearchData();
      if (saved && saved.results && saved.results.length > 0) {
        setResults(saved.results);
        resultsRef.current = saved.results;
        setLastScan(saved.lastScan || null);
        setSearchComplete(true);
      }
      setLoadingStorage(false);
    })();
  }, []);

  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") setSelectedJob(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

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
    resultsRef.current = [];
    setErrors({});
    setSearchComplete(false);
    setTotalSearched(0);
    setLastScan(null);
    setSelectedJob(null);
    const profiles = SEARCH_PROFILES.filter(p => selectedProfiles.has(p.id));
    const newLoading = {};
    profiles.forEach(p => { newLoading[p.id] = true; });
    setLoading(newLoading);

    let searched = 0;
    const scanStart = new Date().toISOString();

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
        } else {
          const [indeedJobs, diceJobs] = await Promise.all([
            searchIndeed(profile.keyword, profile.location).catch(() => []),
            searchDice(profile.keyword, profile.location).catch(() => []),
          ]);
          jobs = [...indeedJobs, ...diceJobs];
        }
        jobs = jobs.map(j => ({ ...j, profileId: profile.id, profileLabel: profile.label }));
        resultsRef.current = [...resultsRef.current, ...jobs];
        setResults([...resultsRef.current]);
        setErrors(prev => ({ ...prev, [profile.id]: null }));
        await saveSearchData({
          results: resultsRef.current,
          lastScan: scanStart,
          profilesUsed: profiles.slice(0, searched + 1).map(p => p.id),
        });
      } catch (err) {
        setErrors(prev => ({ ...prev, [profile.id]: err.message }));
      }
      searched++;
      setTotalSearched(searched);
      setLoading(prev => ({ ...prev, [profile.id]: false }));
    }

    await saveSearchData({
      results: resultsRef.current,
      lastScan: scanStart,
      profilesUsed: profiles.map(p => p.id),
      complete: !abortRef.current,
    });
    setLastScan(scanStart);
    setSearchComplete(true);
  }, [selectedProfiles]);

  const stopSearch = () => { abortRef.current = true; };

  const handleClearSaved = async () => {
    await clearSearchData();
    setResults([]);
    resultsRef.current = [];
    setLastScan(null);
    setSearchComplete(false);
    setErrors({});
    setSelectedJob(null);
  };

  // Deduplicate
  const seen = new Set();
  const dedupedResults = results.filter(j => {
    const key = `${j.title}|||${j.company}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Filter irrelevant
  let filteredResults = dedupedResults.filter(j => {
    const t = (j.title || "").toLowerCase();
    return !t.includes("pest control") && !t.includes("hvac") && !t.includes("construction project") && !t.includes("transportation engineer") && !t.includes("mechanical") && !t.includes("civil engineer") && !t.includes("epc project");
  });

  // Sort
  if (sortBy === "quickApply") {
    filteredResults = [...filteredResults].sort((a, b) => {
      const aQ = a.quickApply || a.easyApply ? 1 : 0;
      const bQ = b.quickApply || b.easyApply ? 1 : 0;
      return bQ - aQ;
    });
  } else if (sortBy === "source") {
    filteredResults = [...filteredResults].sort((a, b) => a.source.localeCompare(b.source));
  }

  const quickApplyCount = filteredResults.filter(j => j.quickApply || j.easyApply).length;
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
          --saved-banner-bg: #f0f4e8;
          --saved-banner-border: #c8d6b0;
          --saved-banner-text: #4a6630;
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
            --saved-banner-bg: #1a2214;
            --saved-banner-border: #2e3a24;
            --saved-banner-text: #8cb870;
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
        .clear-btn {
          padding: 8px 16px; border-radius: 6px; border: 1.5px solid var(--border);
          background: var(--card-bg); color: var(--text-muted); font-size: 12px;
          font-weight: 500; font-family: 'DM Mono', monospace;
          cursor: pointer; transition: all 0.15s;
        }
        .clear-btn:hover { border-color: #c0392b; color: #c0392b; }
        .spinner {
          display: inline-block; width: 14px; height: 14px;
          border: 2px solid var(--border); border-top-color: var(--accent);
          border-radius: 50%; animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
        .result-item { animation: fadeIn 0.25s ease-out; }
        .sort-btn {
          padding: 4px 10px; border-radius: 4px; border: 1px solid var(--border);
          background: var(--card-bg); color: var(--text-muted); font-size: 11px;
          font-family: 'DM Mono', monospace; cursor: pointer; transition: all 0.15s;
        }
        .sort-btn.active { border-color: var(--accent); color: var(--accent); background: var(--accent-light); font-weight: 700; }
        .sort-btn:hover { border-color: var(--accent); }
        .overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.3); z-index: 999; }
      `}</style>

      {selectedJob && <div className="overlay" onClick={() => setSelectedJob(null)} />}
      {selectedJob && <ApplyPanel job={selectedJob} onClose={() => setSelectedJob(null)} />}

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
            Indeed + Dice · Sheridan, IN + Remote
            {lastScan && ` · Last scan: ${new Date(lastScan).toLocaleString()}`}
          </p>
        </div>
      </div>

      <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 24px 60px" }}>

        {!isAnyLoading && lastScan && filteredResults.length > 0 && (
          <div style={{
            background: "var(--saved-banner-bg)", border: "1px solid var(--saved-banner-border)",
            borderRadius: 8, padding: "12px 16px", marginBottom: 20,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: "var(--saved-banner-text)" }}>
              💾 {filteredResults.length} saved results from {timeAgo(lastScan)}
              {quickApplyCount > 0 && ` · ⚡ ${quickApplyCount} quick apply`}
            </div>
            <button className="clear-btn" onClick={handleClearSaved}>Clear Saved</button>
          </div>
        )}

        {loadingStorage && (
          <div style={{
            background: "var(--card-bg)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "16px", marginBottom: 20,
            textAlign: "center", color: "var(--text-muted)",
            fontFamily: "'DM Mono', monospace", fontSize: 13,
          }}>
            <span className="spinner" style={{ marginRight: 10, verticalAlign: "middle" }} />
            Loading saved results...
          </div>
        )}

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
              <div key={p.id} className={`profile-chip ${selectedProfiles.has(p.id) ? "active" : ""}`} onClick={() => toggleProfile(p.id)}>
                <span>{p.icon}</span>
                <span>{p.label}</span>
                {loading[p.id] && <span className="spinner" />}
              </div>
            ))}
          </div>
        </div>

        {/* Run Button */}
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 28 }}>
          <button className="run-btn" onClick={runSearch} disabled={isAnyLoading || selectedProfiles.size === 0}>
            {isAnyLoading ? `Searching... (${totalSearched}/${activeProfiles.length})` : `Run Search (${selectedProfiles.size} profiles)`}
          </button>
          {isAnyLoading && <button className="stop-btn" onClick={stopSearch}>Stop</button>}
        </div>

        {/* Status + sort */}
        {(isAnyLoading || searchComplete) && (
          <div style={{
            background: "var(--card-bg)", border: "1px solid var(--border)",
            borderRadius: 8, padding: "12px 16px", marginBottom: 20,
            fontFamily: "'DM Mono', monospace", fontSize: 12,
            display: "flex", justifyContent: "space-between", alignItems: "center",
            color: "var(--text-secondary)", flexWrap: "wrap", gap: 8,
          }}>
            <span>
              {filteredResults.length} unique jobs{searchComplete && !isAnyLoading ? " ✓" : ""}
              {quickApplyCount > 0 && ` · ⚡ ${quickApplyCount} quick apply`}
            </span>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>Sort:</span>
              <button className={`sort-btn ${sortBy === "default" ? "active" : ""}`} onClick={() => setSortBy("default")}>Default</button>
              <button className={`sort-btn ${sortBy === "quickApply" ? "active" : ""}`} onClick={() => setSortBy("quickApply")}>⚡ Quick Apply</button>
              <button className={`sort-btn ${sortBy === "source" ? "active" : ""}`} onClick={() => setSortBy("source")}>Source</button>
            </div>
          </div>
        )}

        {/* Errors */}
        {Object.entries(errors).filter(([,e]) => e).map(([id, err]) => (
          <div key={id} style={{ background: "#fdf0ef", border: "1px solid #e8c4c0", borderRadius: 6, padding: "8px 12px", marginBottom: 8, fontSize: 12, color: "#9b3b30" }}>
            ⚠️ {SEARCH_PROFILES.find(p => p.id === id)?.label}: {err}
          </div>
        ))}

        {/* Hint */}
        {filteredResults.length > 0 && !selectedJob && (
          <div style={{
            fontFamily: "'DM Mono', monospace", fontSize: 11, color: "var(--text-muted)",
            marginBottom: 12, padding: "0 4px",
          }}>
            Click any job to open the apply panel — tailor your resume, generate a cover letter, and apply.
          </div>
        )}

        {/* Results */}
        {filteredResults.length > 0 && (
          <div>
            {filteredResults.map((job, i) => (
              <div key={`${job.title}-${job.company}-${i}`} className="result-item">
                <JobCard
                  job={job}
                  isSelected={selectedJob && selectedJob.title === job.title && selectedJob.company === job.company}
                  onClick={() => setSelectedJob(job)}
                />
              </div>
            ))}
          </div>
        )}

        {!isAnyLoading && searchComplete && filteredResults.length === 0 && (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
            <div style={{ fontSize: 15, fontWeight: 500 }}>No results found</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Try selecting different search profiles</div>
          </div>
        )}

        {!loadingStorage && !isAnyLoading && !searchComplete && results.length === 0 && (
          <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
            <div style={{ fontSize: 15, fontWeight: 500 }}>Select your search profiles and hit Run</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Results stream in as each profile completes · Click any result to tailor & apply</div>
          </div>
        )}

        <div style={{
          marginTop: 32, padding: "12px 16px", borderRadius: 6,
          background: "var(--accent-light)", border: "1px solid var(--border)",
          fontSize: 11, color: "var(--text-muted)", fontFamily: "'DM Mono', monospace", lineHeight: 1.5,
        }}>
          Job listings retrieved via AI-powered search (Indeed + Dice). Tailored resumes and cover letters are AI-generated starting points — review and adjust before submitting. Verify all details directly with employers.
        </div>
      </div>
    </div>
  );
}
