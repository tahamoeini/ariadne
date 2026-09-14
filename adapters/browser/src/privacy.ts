export interface BrowserTab {
  url?: string;
  title?: string;
  incognito?: boolean;
}

export interface NormalizedBrowserTab {
  title: string;
  url: string;
  domain: string;
  privateBrowsing: false;
}

export interface BrowserNavigationMessage {
  kind: 'event';
  protocol_version: 1;
  source: 'browser';
  event: {
    id: string;
    timestamp: string;
    event_type: 'browser_navigation';
    application: {
      identity: string;
      display_name: string;
      executable: null;
    };
    artifact: {
      kind: 'web_page';
      display_name: string;
      reference: string;
    };
    workspace: null;
    location: null;
    source: 'browser';
    private_browsing: false;
  };
}

export interface BrowserAttachMessage {
  kind: 'attach_reference';
  protocol_version: 1;
  source: 'browser';
  url: string;
  title: string | null;
}

const MAX_TITLE_LENGTH = 400;

function normalizedDomain(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^www\./, '');
}

function isExcludedDomain(domain: string, excludedDomains: readonly string[]): boolean {
  return excludedDomains.some((excluded) => {
    const candidate = normalizedDomain(excluded.replace(/^\.+/, ''));
    return candidate.length > 0 && (domain === candidate || domain.endsWith('.' + candidate));
  });
}

export function sanitizeUrl(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return null;
  }
}

export function normalizeTab(
  tab: BrowserTab,
  excludedDomains: readonly string[] = [],
  capturePrivateBrowsing = false,
): NormalizedBrowserTab | null {
  if (tab.incognito === true && !capturePrivateBrowsing) return null;
  const url = tab.url ? sanitizeUrl(tab.url) : null;
  if (!url) return null;
  const parsed = new URL(url);
  const domain = normalizedDomain(parsed.hostname);
  if (!domain || isExcludedDomain(domain, excludedDomains)) return null;
  return {
    title: (tab.title ?? '').trim().slice(0, MAX_TITLE_LENGTH),
    url,
    domain,
    privateBrowsing: false,
  };
}

export function toNavigationMessage(
  tab: BrowserTab,
  eventId: string,
  timestamp: string,
  excludedDomains: readonly string[] = [],
): BrowserNavigationMessage | null {
  const normalized = normalizeTab(tab, excludedDomains);
  if (!normalized) return null;
  return {
    kind: 'event',
    protocol_version: 1,
    source: 'browser',
    event: {
      id: eventId,
      timestamp,
      event_type: 'browser_navigation',
      application: {
        identity: 'browser',
        display_name: 'Browser',
        executable: null,
      },
      artifact: {
        kind: 'web_page',
        display_name: normalized.title || normalized.domain,
        reference: normalized.url,
      },
      workspace: null,
      location: null,
      source: 'browser',
      private_browsing: false,
    },
  };
}

export function toAttachReferenceMessage(
  tab: BrowserTab,
  excludedDomains: readonly string[] = [],
): BrowserAttachMessage | null {
  const normalized = normalizeTab(tab, excludedDomains);
  if (!normalized) return null;
  return {
    kind: 'attach_reference',
    protocol_version: 1,
    source: 'browser',
    url: normalized.url,
    title: normalized.title || null,
  };
}
