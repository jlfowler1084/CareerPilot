/**
 * CAR-198: Tests for getGmailClient() reading from data/gmail_token.json.
 *
 * We use vitest's module mocking to intercept fs.existsSync / fs.readFileSync
 * so no real file I/O or network calls occur. Fake credentials are used
 * throughout — no real OAuth secrets are ever logged or asserted.
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
    gmail: vi.fn().mockReturnValue({ /* fake gmail client */ }),
  },
}))

// Import after mocks are registered.
import { getGmailClient } from "@/lib/gmail/auth"

const FAKE_TOKEN_FILE: Record<string, unknown> = {
  token: "ya29.fake-access-token",
  refresh_token: "1//04fake-refresh-token-for-testing",
  token_uri: "https://oauth2.googleapis.com/token",
  client_id: "fake-client-id.apps.googleusercontent.com",
  client_secret: "GOCSPX-fake-client-secret",
  scopes: ["https://www.googleapis.com/auth/gmail.modify"],
  expiry: "2099-01-01T00:00:00Z",
}

describe("getGmailClient (CAR-198: file-based token)", () => {
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
    delete process.env.GMAIL_TOKEN_FILE
  })

  it("reads the token file and passes refresh_token to setCredentials", () => {
    getGmailClient()

    expect(mockSetCredentials).toHaveBeenCalledOnce()
    expect(mockSetCredentials).toHaveBeenCalledWith({
      refresh_token: "1//04fake-refresh-token-for-testing",
    })
  })

  it("passes client_id and client_secret from the token file to OAuth2 constructor", () => {
    getGmailClient()

    expect(mockOAuth2Constructor).toHaveBeenCalledOnce()
    const [clientId, clientSecret] = mockOAuth2Constructor.mock.calls[0]
    expect(clientId).toBe("fake-client-id.apps.googleusercontent.com")
    expect(clientSecret).toBe("GOCSPX-fake-client-secret")
  })

  it("throws a clear error when token file is missing", () => {
    mockExistsSync.mockReturnValue(false)

    expect(() => getGmailClient()).toThrowError(
      /Gmail token file not found at .+\. Run 'python -m cli auth gmail'/
    )
  })

  it("throws a clear error when refresh_token field is absent", () => {
    const noRefreshToken = { ...FAKE_TOKEN_FILE }
    delete noRefreshToken.refresh_token
    mockReadFileSync.mockReturnValue(JSON.stringify(noRefreshToken))

    expect(() => getGmailClient()).toThrowError(
      /missing the refresh_token field\. Re-run CLI auth/
    )
  })

  it("honours GMAIL_TOKEN_FILE env-var override for the file path", () => {
    process.env.GMAIL_TOKEN_FILE = "/custom/path/token.json"
    // existsSync should be called with the custom path.
    mockExistsSync.mockImplementation((p: string) => p === "/custom/path/token.json")
    mockReadFileSync.mockImplementation((p: string) => {
      if (p === "/custom/path/token.json") return JSON.stringify(FAKE_TOKEN_FILE)
      throw new Error("unexpected path: " + p)
    })

    getGmailClient()

    expect(mockExistsSync).toHaveBeenCalledWith("/custom/path/token.json")
    expect(mockReadFileSync).toHaveBeenCalledWith("/custom/path/token.json", "utf-8")
  })

  it("re-reads the file on each call (no module-level caching)", () => {
    getGmailClient()
    getGmailClient()

    // readFileSync should be called twice — once per invocation.
    expect(mockReadFileSync).toHaveBeenCalledTimes(2)
  })
})
