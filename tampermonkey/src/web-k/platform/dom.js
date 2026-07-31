export const MESSAGE_ID_ATTRIBUTES = Object.freeze([
  'data-mid',
  'data-message-id',
  'data-msg-id',
  'data-message',
]);

export const PEER_ID_ATTRIBUTES = Object.freeze(['data-peer-id', 'data-peer']);

export const NUMERIC_DATA_ATTRIBUTES = Object.freeze([
  ...MESSAGE_ID_ATTRIBUTES,
  ...PEER_ID_ATTRIBUTES,
  'data-index',
  'data-media-index',
]);

export function isElementVisible(element) {
  if (!(element instanceof Element) || !element.isConnected) return false;
  const rect = element.getBoundingClientRect();
  if (rect.width < 1 || rect.height < 1) return false;
  const style = getComputedStyle(element);
  return style.display !== 'none'
    && style.visibility !== 'hidden'
    && style.opacity !== '0'
    && element.getAttribute('aria-hidden') !== 'true'
    && !element.hasAttribute('hidden');
}

export function getNumericDataAttributes(element) {
  if (!(element instanceof Element)) return {};
  const result = {};
  for (const attributeName of NUMERIC_DATA_ATTRIBUTES) {
    const value = element.getAttribute(attributeName);
    if (value && /^-?\d+$/.test(value)) result[attributeName] = value;
  }
  return result;
}

export function describeElement(element) {
  if (!(element instanceof Element)) return undefined;
  const rect = element.getBoundingClientRect();
  return {
    tag: element.tagName.toLowerCase(),
    classNames: Array.from(element.classList).slice(0, 12),
    role: element.getAttribute('role') || '',
    hasAriaLabel: element.hasAttribute('aria-label'),
    hasTitle: element.hasAttribute('title'),
    hasHref: element instanceof HTMLAnchorElement && element.hasAttribute('href'),
    dataAttributeNames: Array.from(element.attributes)
      .filter((attribute) => attribute.name.startsWith('data-'))
      .slice(0, 16)
      .map((attribute) => attribute.name),
    numericDataAttributes: getNumericDataAttributes(element),
    rect: {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      left: Math.round(rect.left),
      top: Math.round(rect.top),
    },
    imageCount: element.querySelectorAll('img').length,
    videoCount: element.querySelectorAll('video').length,
    buttonCount: element.querySelectorAll('button, [role="button"]').length,
  };
}

function classifyUrlToken(value) {
  if (!value) return 'empty';
  if (/^-?\d+$/.test(value)) return 'number';
  return 'text';
}

export function describeHrefPattern(element) {
  if (!(element instanceof HTMLAnchorElement) || !element.hasAttribute('href')) return undefined;
  try {
    const url = new URL(element.href, location.href);
    const hashPath = url.hash.split('?')[0].replace(/^#/, '');
    return {
      protocol: url.protocol,
      host: ['web.telegram.org', 't.me', 'telegram.me'].includes(url.hostname)
        ? url.hostname
        : 'other',
      pathPattern: url.pathname.split('/').filter(Boolean).slice(0, 8).map(classifyUrlToken),
      hashPattern: hashPath.split('/').filter(Boolean).slice(0, 8).map(classifyUrlToken),
      queryKeys: Array.from(url.searchParams.keys()).slice(0, 12),
      hashQueryKeys: url.hash.includes('?')
        ? Array.from(new URLSearchParams(url.hash.slice(url.hash.indexOf('?') + 1)).keys()).slice(0, 12)
        : [],
    };
  } catch (error) {
    return { invalid: true };
  }
}

export function describeControl(element) {
  const description = describeElement(element);
  if (!description) return undefined;
  return {
    ...description,
    hasSvg: Boolean(element.querySelector('svg')),
    hrefPattern: describeHrefPattern(element),
  };
}

export function findScrollableAncestor(element) {
  let current = element instanceof Element ? element.parentElement : undefined;
  while (current && current !== document.body && current !== document.documentElement) {
    const style = getComputedStyle(current);
    const canScroll = /(auto|scroll|overlay)/.test(style.overflowY)
      && current.scrollHeight > current.clientHeight + 2;
    if (canScroll) return current;
    current = current.parentElement;
  }
  return undefined;
}
