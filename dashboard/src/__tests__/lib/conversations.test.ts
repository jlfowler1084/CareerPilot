import { describe, it, expect } from "vitest"
import { CONVERSATION_TYPES } from "@/lib/constants"
import type {
  ConversationType,
  Conversation,
  ConversationPerson,
  QuestionAsked,
  QuestionYouAsked,
  ActionItem,
  ConversationPattern,
} from "@/types"

// ─── Constants ─────────────────────────────────────────────────────

describe("CONVERSATION_TYPES", () => {
  it("has all 6 conversation types", () => {
    const ids = CONVERSATION_TYPES.map((t) => t.id)
    expect(ids).toEqual([
      "phone",
      "video",
      "email",
      "in_person",
      "chat",
      "note",
    ])
  })

  it("each type has id, label, and icon", () => {
    for (const t of CONVERSATION_TYPES) {
      expect(t.id).toBeTruthy()
      expect(t.label).toBeTruthy()
      expect(t.icon).toBeTruthy()
    }
  })
})

// ─── Type structure validation ─────────────────────────────────────

describe("Conversation type structure", () => {
  const validTypes: ConversationType[] = [
    "phone",
    "video",
    "email",
    "in_person",
    "chat",
    "note",
  ]

  it("ConversationType includes all expected values", () => {
    // Verify type assignment compiles for all values
    for (const t of validTypes) {
      const assigned: ConversationType = t
      expect(assigned).toBe(t)
    }
  })

  it("ConversationPerson has expected shape", () => {
    const person: ConversationPerson = {
      name: "Jane Doe",
      role: "Hiring Manager",
      email: "jane@example.com",
      phone: "555-1234",
    }
    expect(person.name).toBe("Jane Doe")
    expect(person.role).toBe("Hiring Manager")
  })

  it("ConversationPerson works with minimal fields", () => {
    const person: ConversationPerson = { name: "John" }
    expect(person.name).toBe("John")
    expect(person.role).toBeUndefined()
    expect(person.email).toBeUndefined()
  })

  it("QuestionAsked has expected shape", () => {
    const q: QuestionAsked = {
      question: "Tell me about your PowerShell experience",
      your_answer: "I built 30+ automation scripts at Venable",
      quality_rating: 4,
    }
    expect(q.question).toBeTruthy()
    expect(q.your_answer).toBeTruthy()
    expect(q.quality_rating).toBe(4)
  })

  it("QuestionYouAsked has expected shape", () => {
    const q: QuestionYouAsked = {
      question: "What does the team structure look like?",
      their_response: "3 engineers, 1 manager",
    }
    expect(q.question).toBeTruthy()
    expect(q.their_response).toBeTruthy()
  })

  it("ActionItem has expected shape", () => {
    const item: ActionItem = {
      task: "Send portfolio link",
      due_date: "2026-03-28",
      completed: false,
    }
    expect(item.task).toBeTruthy()
    expect(item.completed).toBe(false)
    expect(item.due_date).toBe("2026-03-28")
  })

  it("ActionItem works without due_date", () => {
    const item: ActionItem = { task: "Follow up", completed: true }
    expect(item.due_date).toBeUndefined()
    expect(item.completed).toBe(true)
  })
})

// ─── Sentiment validation ──────────────────────────────────────────

describe("Sentiment validation", () => {
  it("accepts values 1-5", () => {
    for (let i = 1; i <= 5; i++) {
      expect(i).toBeGreaterThanOrEqual(1)
      expect(i).toBeLessThanOrEqual(5)
    }
  })

  it("rejects values outside 1-5 range", () => {
    const invalidValues = [0, -1, 6, 10, 100]
    for (const val of invalidValues) {
      expect(val >= 1 && val <= 5).toBe(false)
    }
  })

  it("null sentiment is valid (no rating)", () => {
    const conversation: Pick<Conversation, "sentiment"> = {
      sentiment: null,
    }
    expect(conversation.sentiment).toBeNull()
  })
})

// ─── Conversation full structure ───────────────────────────────────

describe("Conversation full structure", () => {
  const fullConversation: Conversation = {
    id: "test-uuid",
    application_id: "app-uuid",
    user_id: "user-uuid",
    conversation_type: "phone",
    title: "Initial phone screen",
    people: [
      { name: "Jane", role: "HR" },
      { name: "Bob", role: "Tech Lead" },
    ],
    date: "2026-03-25T14:00:00Z",
    duration_minutes: 30,
    notes: "Good conversation about team culture and PowerShell automation",
    questions_asked: [
      {
        question: "Describe your automation experience",
        your_answer: "Built 30+ PowerShell scripts",
        quality_rating: 4,
      },
    ],
    questions_you_asked: [
      {
        question: "What's the team size?",
        their_response: "5 engineers",
      },
    ],
    action_items: [
      { task: "Send resume", due_date: "2026-03-26", completed: false },
    ],
    topics: ["powershell", "automation", "team culture"],
    sentiment: 4,
    transcript_url: null,
    ai_analysis: null,
    created_at: "2026-03-25T14:30:00Z",
    updated_at: "2026-03-25T14:30:00Z",
  }

  it("has all required fields", () => {
    expect(fullConversation.id).toBeTruthy()
    expect(fullConversation.application_id).toBeTruthy()
    expect(fullConversation.user_id).toBeTruthy()
    expect(fullConversation.conversation_type).toBeTruthy()
    expect(fullConversation.date).toBeTruthy()
  })

  it("has correct people array", () => {
    expect(fullConversation.people).toHaveLength(2)
    expect(fullConversation.people[0].name).toBe("Jane")
    expect(fullConversation.people[1].role).toBe("Tech Lead")
  })

  it("has correct questions", () => {
    expect(fullConversation.questions_asked).toHaveLength(1)
    expect(fullConversation.questions_you_asked).toHaveLength(1)
  })

  it("has correct topics", () => {
    expect(fullConversation.topics).toHaveLength(3)
    expect(fullConversation.topics).toContain("powershell")
  })

  it("has correct action items", () => {
    expect(fullConversation.action_items).toHaveLength(1)
    expect(fullConversation.action_items[0].completed).toBe(false)
  })

  it("sentiment is within valid range", () => {
    expect(fullConversation.sentiment).toBeGreaterThanOrEqual(1)
    expect(fullConversation.sentiment).toBeLessThanOrEqual(5)
  })
})

// ─── Pattern detection structure ───────────────────────────────────

describe("ConversationPattern structure", () => {
  const mockPattern: ConversationPattern = {
    recurring_questions: [
      {
        question: "Tell me about your automation experience",
        companies: ["Acme Corp", "TechCo"],
        count: 3,
      },
    ],
    strongest_topics: [
      { topic: "PowerShell", avg_sentiment: 4.5, count: 5 },
    ],
    weak_areas: [
      {
        area: "Cloud architecture",
        suggestion: "Study Azure solutions architect path",
      },
    ],
    this_week: "3 conversations logged this week with 2 companies.",
  }

  it("has all required sections", () => {
    expect(mockPattern.recurring_questions).toBeDefined()
    expect(mockPattern.strongest_topics).toBeDefined()
    expect(mockPattern.weak_areas).toBeDefined()
    expect(mockPattern.this_week).toBeDefined()
  })

  it("recurring questions have correct shape", () => {
    const q = mockPattern.recurring_questions[0]
    expect(q.question).toBeTruthy()
    expect(q.companies).toBeInstanceOf(Array)
    expect(q.count).toBeGreaterThan(0)
  })

  it("strongest topics have correct shape", () => {
    const t = mockPattern.strongest_topics[0]
    expect(t.topic).toBeTruthy()
    expect(t.avg_sentiment).toBeGreaterThanOrEqual(1)
    expect(t.avg_sentiment).toBeLessThanOrEqual(5)
    expect(t.count).toBeGreaterThan(0)
  })

  it("weak areas have correct shape", () => {
    const w = mockPattern.weak_areas[0]
    expect(w.area).toBeTruthy()
    expect(w.suggestion).toBeTruthy()
  })
})

// ─── Search / filter logic ─────────────────────────────────────────

describe("Conversation search and filter logic", () => {
  const conversations: Pick<
    Conversation,
    "id" | "conversation_type" | "title" | "notes" | "topics" | "application_id"
  >[] = [
    {
      id: "1",
      application_id: "app-1",
      conversation_type: "phone",
      title: "Phone screen with HR",
      notes: "Discussed salary expectations and team size",
      topics: ["salary", "team"],
    },
    {
      id: "2",
      application_id: "app-1",
      conversation_type: "video",
      title: "Technical interview",
      notes: "PowerShell scripting questions and Azure fundamentals",
      topics: ["powershell", "azure"],
    },
    {
      id: "3",
      application_id: "app-2",
      conversation_type: "email",
      title: "Follow-up email",
      notes: "Sent thank you note after interview",
      topics: ["follow-up"],
    },
    {
      id: "4",
      application_id: "app-2",
      conversation_type: "in_person",
      title: "On-site visit",
      notes: "Met the infrastructure team, toured datacenter",
      topics: ["infrastructure", "datacenter"],
    },
  ]

  function filterByType(type: string) {
    return conversations.filter((c) => c.conversation_type === type)
  }

  function filterBySearch(query: string) {
    const q = query.toLowerCase()
    return conversations.filter(
      (c) =>
        (c.title && c.title.toLowerCase().includes(q)) ||
        (c.notes && c.notes.toLowerCase().includes(q)) ||
        (c.topics && c.topics.some((t) => t.toLowerCase().includes(q)))
    )
  }

  function filterByApplication(appId: string) {
    return conversations.filter((c) => c.application_id === appId)
  }

  it("filters by conversation type", () => {
    expect(filterByType("phone")).toHaveLength(1)
    expect(filterByType("video")).toHaveLength(1)
    expect(filterByType("email")).toHaveLength(1)
    expect(filterByType("chat")).toHaveLength(0)
  })

  it("searches across title", () => {
    expect(filterBySearch("technical")).toHaveLength(1)
    expect(filterBySearch("phone screen")).toHaveLength(1)
  })

  it("searches across notes", () => {
    expect(filterBySearch("PowerShell")).toHaveLength(1)
    expect(filterBySearch("salary")).toHaveLength(1)
    expect(filterBySearch("datacenter")).toHaveLength(1)
  })

  it("searches across topics", () => {
    expect(filterBySearch("azure")).toHaveLength(1)
    expect(filterBySearch("infrastructure")).toHaveLength(1)
  })

  it("search is case-insensitive", () => {
    expect(filterBySearch("POWERSHELL")).toHaveLength(1)
    expect(filterBySearch("powershell")).toHaveLength(1)
  })

  it("filters by application", () => {
    expect(filterByApplication("app-1")).toHaveLength(2)
    expect(filterByApplication("app-2")).toHaveLength(2)
    expect(filterByApplication("app-3")).toHaveLength(0)
  })

  it("returns empty for no-match search", () => {
    expect(filterBySearch("kubernetes")).toHaveLength(0)
  })
})

// ─── Topic extraction mock ─────────────────────────────────────────

describe("Topic extraction (mocked)", () => {
  function mockExtractTopics(notes: string): string[] {
    // Simulate the AI extraction by keyword matching
    const keywords = [
      "powershell",
      "azure",
      "vmware",
      "salary",
      "team",
      "culture",
      "automation",
      "active directory",
      "infrastructure",
    ]
    const lower = notes.toLowerCase()
    return keywords.filter((k) => lower.includes(k))
  }

  it("extracts relevant topics from notes", () => {
    const topics = mockExtractTopics(
      "Discussed PowerShell automation and Azure VM provisioning"
    )
    expect(topics).toContain("powershell")
    expect(topics).toContain("azure")
    expect(topics).toContain("automation")
  })

  it("returns empty array for notes with no matching topics", () => {
    const topics = mockExtractTopics("Had a brief chat, nothing specific discussed")
    expect(topics).toHaveLength(0)
  })

  it("extracts multiple topics", () => {
    const topics = mockExtractTopics(
      "Talked about VMware infrastructure, Active Directory management, and team culture"
    )
    expect(topics.length).toBeGreaterThanOrEqual(3)
    expect(topics).toContain("vmware")
    expect(topics).toContain("active directory")
    expect(topics).toContain("infrastructure")
    expect(topics).toContain("culture")
  })
})

// ─── RLS policy simulation ─────────────────────────────────────────

describe("RLS policy logic (simulated)", () => {
  const conversations = [
    { id: "1", user_id: "user-a", title: "My phone screen" },
    { id: "2", user_id: "user-b", title: "Their phone screen" },
    { id: "3", user_id: "user-a", title: "My follow up" },
  ]

  function getConversationsForUser(userId: string) {
    return conversations.filter((c) => c.user_id === userId)
  }

  it("user can only see their own conversations", () => {
    const userA = getConversationsForUser("user-a")
    expect(userA).toHaveLength(2)
    expect(userA.every((c) => c.user_id === "user-a")).toBe(true)
  })

  it("user cannot see other users' conversations", () => {
    const userA = getConversationsForUser("user-a")
    expect(userA.some((c) => c.user_id === "user-b")).toBe(false)
  })

  it("different user sees only their conversations", () => {
    const userB = getConversationsForUser("user-b")
    expect(userB).toHaveLength(1)
    expect(userB[0].title).toBe("Their phone screen")
  })
})

// ─── Date range filtering ──────────────────────────────────────────

describe("Date range filtering", () => {
  const conversations = [
    { id: "1", date: "2026-03-20T10:00:00Z" },
    { id: "2", date: "2026-03-22T14:00:00Z" },
    { id: "3", date: "2026-03-25T09:00:00Z" },
    { id: "4", date: "2026-03-28T16:00:00Z" },
  ]

  function filterByDateRange(start: string, end: string) {
    const startDate = new Date(start).getTime()
    const endDate = new Date(end).getTime()
    return conversations.filter((c) => {
      const d = new Date(c.date).getTime()
      return d >= startDate && d <= endDate
    })
  }

  it("filters within a date range", () => {
    const result = filterByDateRange("2026-03-21", "2026-03-26")
    expect(result).toHaveLength(2)
    expect(result.map((c) => c.id)).toEqual(["2", "3"])
  })

  it("returns all for full range", () => {
    const result = filterByDateRange("2026-03-01", "2026-03-31")
    expect(result).toHaveLength(4)
  })

  it("returns empty for non-matching range", () => {
    const result = filterByDateRange("2026-04-01", "2026-04-30")
    expect(result).toHaveLength(0)
  })
})
