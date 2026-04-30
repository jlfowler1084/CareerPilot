/**
 * CAR-206: Tests for getCalendarClient() reading from data/calendar_token.json.
 *
 * Mirrors the CAR-198 Gmail auth tests. We use vitest's module mocking to intercept
 * fs.existsSync / fs.readFileSync so no real file I/O or network calls occur. Fake
 * credentials are used throughout — no real OAuth secrets are ever logged or asserted.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Use vi.hoisted so that the mock factory can reference these variables
// even though vi.mock calls are hoisted above imports.
const { mockExistsSync, mockReadFileSync, mockSetCredentials, mockOAuth2Constructor } =
  vi.hoisted(() => {
    const mockSetCredentials = vi.fn()
    // Must be a regular function (not arrow) so `new OAuth2(...)` works as a constructor.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockOAuth2Constructor: any = vi.fn(function (this: any) {
      this.setCredentials = mockSetCredentials
    })
    return {
      mockExistsSync: vi.fn(),
      mockReadFileSync: vi.fn(),
      mockSetCredentials,
      mockOAuth2Constructor,
    }
  })

vi.mock("fs", () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}))

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: mockOAuth2Constructor,
    },
    calendar: vi.fn().mockReturnValue({ /* fake calendar client */ }),
  },
}))

// Import after mocks are registered.
import { getCalendarClient } from "@/lib/calendar/auth"

const FAKE_TOKEN_FILE: Record<string, unknown> = {
  token: "ya29.fake-access-token",
  refresh_token: "1//04fake-refresh-token-for-testing",
  token_uri: "https://oauth2.googleapis.com/token",
  client_id: "fake-client-id.apps.googleusercontent.com",
  client_secret: "GOCSPX-fake-client-secret",
  scopes: ["https://www.googleapis.com/auth/calendar"],
  expiry: "2099-01-01T00:00:00Z",
}

describe("getCalendarClient (CAR-206: file-based token)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: token file exists with valid content.
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify(FAKE_TOKEN_FILE))
    // Re-configure constructor after clearAllMocks resets the implementation.
    // Must be a regular function so `new OAuth2(...)` works as a constructor.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mockOAuth2Constructor.mockImplementation(function (this: any) {
      this.setCredentials = mockSetCredentials
    })
  })

  afterEach(() => {
    delete process.env.CALENDAR_TOKEN_FILE
  })

  it("reads the token file and passes refresh_token to setCredentials", () => {
    getCalendarClient()

    expect(mockSetCredentials).toHaveBeenCalledOnce()
    expect(mockSetCredentials).toHaveBeenCalledWith({
      refresh_token: "1//04fake-refresh-token-for-testing",
    })
  })

  it("passes client_id and client_secret from the token file to OAuth2 constructor", () => {
    getCalendarClient()

    expect(mockOAuth2Constructor).toHaveBeenCalledOnce()
    const [clientId, clientSecret] = mockOAuth2Constructor.mock.calls[0]
    expect(clientId).toBe("fake-client-id.apps.googleusercontent.com")
    expect(clientSecret).toBe("GOCSPX-fake-client-secret")
  })

  it("throws a clear error when token file is missing", () => {
    mockExistsSync.mockReturnValue(false)

    expect(() => getCalendarClient()).toThrowError(
      /Calendar token file not found at .+\. Run 'python -m cli calendar'/
    )
  })

  it("throws a clear error when refresh_token field is absent", () => {
    const noRefreshToken = { ...FAKE_TOKEN_FILE }
    delete noRefreshToken.refresh_token
    mockReadFileSync.mockReturnValue(JSON.stringify(noRefreshToken))

    expect(() => getCalendarClient()).toThrowError(
      /missing the refresh_token field\. Re-run CLI calendar auth/
    )
  })

  it("honours CALENDAR_TOKEN_FILE env-var override for the file path", () => {
    process.env.CALENDAR_TOKEN_FILE = "/custom/path/calendar_token.json"
    // existsSync should be called with the custom path.
    mockExistsSync.mockImplementation((p: string) => p === "/custom/path/calendar_token.json")
    mockReadFileSync.mockImplementation((p: string) => {
      if (p === "/custom/path/calendar_token.json") return JSON.stringify(FAKE_TOKEN_FILE)
      throw new Error("unexpected path: " + p)
    })

    getCalendarClient()

    expect(mockExistsSync).toHaveBeenCalledWith("/custom/path/calendar_token.json")
    expect(mockReadFileSync).toHaveBeenCalledWith("/custom/path/calendar_token.json", "utf-8")
  })

  it("re-reads the file on each call (no module-level caching)", () => {
    getCalendarClient()
    getCalendarClient()

    // readFileSync should be called twice — once per invocation.
    expect(mockReadFileSync).toHaveBeenCalledTimes(2)
  })
})
