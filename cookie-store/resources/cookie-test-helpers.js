'use strict';

// TODO(jsbell): Once ServiceWorker is supported, add arbitrary path coverage.
const kPath = location.pathname.replace(/[^/]+$/, '');

// See https://github.com/whatwg/html/pull/3011#issuecomment-331187136
// and https://www.chromestatus.com/feature/6170540112871424
const kMetaHttpEquivSetCookieIsGone = true;

// True when running in a document context as opposed to a worker context
const kHasDocument = typeof document !== 'undefined';

// True when running on unsecured 'http:' rather than secured 'https:'.
const kIsUnsecured = location.protocol !== 'https:';

const kCookieHelperCgi = 'resources/cookie_helper.py';

// Async wrapper for an async function or promise that is expected
// reject in an unsecured (non-https:) context and work in a secured
// (https:) context.
//
// Parameters:
//
// - testCase: (TestCase) test case context
// - code: (Error class or number) expected rejection type in unsecured context
// - promise: (thenable) test code
// - message: (optional; string) message to forward to promise_rejects in
//   unsecured context
async function promise_rejects_when_unsecured(
  testCase,
  code,
  promise,
  message = 'Feature unavailable from unsecured contexts') {
  if (kIsUnsecured)
    await promise_rejects(testCase, code, promise, message);
  else await promise;
};

// Converts a list of cookie records {name, value} to [name=]value; ... as
// seen in Cookie: and document.cookie.
//
// Parameters:
// - cookies: (array of {name, value}) records to convert
//
// Returns a string serializing the records, or undefined if no records were
// given.
function cookieString(cookies) {
  return cookies.length ? cookies.map((
    {name, value}) => (name ? (name + '=') : '') + value).join('; ') :
  undefined;
}

// Approximate async equivalent to the document.cookie getter but with
// important differences: optional additional getAll arguments are
// forwarded, and an empty cookie jar returns undefined.
//
// This is intended primarily for verification against expected cookie
// jar contents. It should produce more readable messages using
// assert_equals in failing cases than assert_object_equals would
// using parsed cookie jar contents and also allows expectations to be
// written more compactly.
async function getCookieString(...args) {
  return cookieString(await cookieStore.getAll(...args));
}

// Approximate async equivalent to the document.cookie getter but from
// the server's point of view. Returns UTF-8 interpretation. Allows
// sub-path to be specified.
//
// Unlike document.cookie, this returns undefined when no cookies are
// present.
async function getCookieStringHttp(extraPath = null) {
  const url =
        kCookieHelperCgi + ((extraPath == null) ? '' : ('/' + extraPath));
  const response = await fetch(url, { credentials: 'include' });
  const text = await response.text();
  assert_equals(
      response.ok,
      true,
      'CGI should have succeeded in getCookieStringHttp\n' + text);
  assert_equals(
      response.headers.get('content-type'),
      'text/plain; charset=utf-8',
      'CGI did not return UTF-8 text in getCookieStringHttp');
  if (text === '')
    return undefined;
  assert_equals(
      text.indexOf('cookie='),
      0,
      'CGI response did not begin with "cookie=" and was not empty: ' + text);
  return decodeURIComponent(text.replace(/^cookie=/, ''));
}

// Approximate async equivalent to the document.cookie getter but from
// the server's point of view. Returns binary string
// interpretation. Allows sub-path to be specified.
//
// Unlike document.cookie, this returns undefined when no cookies are
// present.
async function getCookieBinaryHttp(extraPath = null) {
  const url =
        kCookieHelperCgi +
        ((extraPath == null) ?
         '' :
         ('/' + extraPath)) + '?charset=iso-8859-1';
  const response = await fetch(url, { credentials: 'include' });
  const text = await response.text();
  assert_equals(
      response.ok,
      true,
      'CGI should have succeeded in getCookieBinaryHttp\n' + text);
  assert_equals(
      response.headers.get('content-type'),
      'text/plain; charset=iso-8859-1',
      'CGI did not return ISO 8859-1 text in getCookieBinaryHttp');
  if (text === '')
    return undefined;
  assert_equals(
      text.indexOf('cookie='),
      0,
      'CGI response did not begin with "cookie=" and was not empty: ' + text);
  return unescape(text.replace(/^cookie=/, ''));
}

// Approximate async equivalent to the document.cookie setter but from
// the server's point of view.
async function setCookieStringHttp(setCookie) {
  const encodedSetCookie = encodeURIComponent(setCookie);
  const url = kCookieHelperCgi;
  const headers = new Headers();
  headers.set(
      'content-type',
      'application/x-www-form-urlencoded; charset=utf-8');
  const response = await fetch(
      url,
      {
        credentials: 'include',
        method: 'POST',
        headers: headers,
        body: 'set-cookie=' + encodedSetCookie,
      });
  const text = await response.text();
  assert_equals(
      response.ok,
      true,
      'CGI should have succeeded in setCookieStringHttp set-cookie: ' +
        setCookie + '\n' + text);
  assert_equals(
      response.headers.get('content-type'),
      'text/plain; charset=utf-8',
      'CGI did not return UTF-8 text in setCookieStringHttp');
  assert_equals(
      text,
      'set-cookie=' + encodedSetCookie,
      'CGI did not faithfully echo the set-cookie value');
}

// Approximate async equivalent to the document.cookie setter but from
// the server's point of view. This version sets a binary cookie rather
// than a UTF-8 one.
async function setCookieBinaryHttp(setCookie) {
  const encodedSetCookie = escape(setCookie).split('/').join('%2F');
  const url = kCookieHelperCgi + '?charset=iso-8859-1';
  const headers = new Headers();
  headers.set(
      'content-type',
      'application/x-www-form-urlencoded; charset=iso-8859-1');
  const response = await fetch(url, {
    credentials: 'include',
    method: 'POST',
    headers: headers,
    body: 'set-cookie=' + encodedSetCookie
  });
  const text = await response.text();
  assert_equals(
      response.ok,
      true,
      'CGI should have succeeded in setCookieBinaryHttp set-cookie: ' +
        setCookie + '\n' + text);
  assert_equals(
      response.headers.get('content-type'),
      'text/plain; charset=iso-8859-1',
      'CGI did not return Latin-1 text in setCookieBinaryHttp');
  assert_equals(
      text,
      'set-cookie=' + encodedSetCookie,
      'CGI did not faithfully echo the set-cookie value');
}

// Approximate async equivalent to the document.cookie setter but using
// <meta http-equiv="set-cookie" content="..."> written into a temporary
// IFRAME. Merely appending the node to HEAD works in some browsers (e.g.
// Chromium) but not others (e.g. Firefox.)
async function setCookieStringMeta(setCookie) {
  if (document.readyState !== 'complete') {
    await new Promise(resolve => addEventListener('load', resolve, true));
  }
  const meta = Object.assign(document.createElement('meta'), {
    httpEquiv: 'set-cookie',
    content: setCookie
  });
  const ifr = document.createElement('iframe');
  await new Promise(resolve => document.body.appendChild(Object.assign(
      ifr,
      {
        onload: resolve
      })));
  try {
    ifr.contentWindow.document.open('text/html; charset=utf-8');
    ifr.contentWindow.document.write([
      '<!DOCTYPE html>',
      '<meta charset="utf-8">',
      meta.outerHTML
    ].join('\r\n'));
    ifr.contentWindow.document.close();
  } finally {
    if (ifr.parentNode)
      ifr.parentNode.removeChild(ifr);
  }
}

// Async document.cookie getter; converts '' to undefined which loses
// information in the edge case where a single ''-valued anonymous
// cookie is visible.
async function getCookieStringDocument() {
  if (!kHasDocument)
    throw 'document.cookie not available in this context';
  return String(document.cookie || '') || undefined;
}

// Async document.cookie setter
async function setCookieStringDocument(setCookie) {
  if (!kHasDocument)
    throw 'document.cookie not available in this context';
  document.cookie = setCookie;
}


// Helper to verify first-of-name get using async/await.
//
// Returns the first script-visible value of the __Host-COOKIENAME cookie or
// undefined if no matching cookies are script-visible.
async function getOneSimpleOriginCookie() {
  let cookie = await cookieStore.get('__Host-COOKIENAME');
  if (!cookie) return undefined;
  return cookie.value;
}

// Returns the number of script-visible cookies whose names start with
// __Host-COOKIEN
async function countMatchingSimpleOriginCookies() {
  let cookieList = await cookieStore.getAll({
    name: '__Host-COOKIEN',
    matchType: 'startsWith'
  });
  return cookieList.length;
}

// Set the secure implicit-domain cookie __Host-COOKIENAME with value
// cookie-value on path / and session duration.
async function setOneSimpleOriginSessionCookie() {
  await cookieStore.set('__Host-COOKIENAME', 'cookie-value');
};

// Set the secure example.org-domain cookie __Secure-COOKIENAME with
// value cookie-value on path /cgi-bin/ and 24 hour duration; domain
// and path will be rewritten below.
//
// This uses a Date object for expiration.
async function setOneDaySecureCookieWithDate() {
  // one day ahead, ignoring a possible leap-second
  let inTwentyFourHours = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await cookieStore.set('__Secure-COOKIENAME', 'cookie-value', {
    path: kPath,
    expires: inTwentyFourHours,
    secure: true,
    domain: location.hostname
  });
}

// Set the unsecured example.org-domain cookie LEGACYCOOKIENAME with
// value cookie-value on path /cgi-bin/ and 24 hour duration; domain
// and path will be rewritten below.
//
// This uses milliseconds since the start of the Unix epoch for
// expiration.
async function setOneDayUnsecuredCookieWithMillisecondsSinceEpoch() {
  // one day ahead, ignoring a possible leap-second
  let inTwentyFourHours = Date.now() + 24 * 60 * 60 * 1000;
  await cookieStore.set('LEGACYCOOKIENAME', 'cookie-value', {
    path: kPath,
    expires: inTwentyFourHours,
    secure: false,
    domain: location.hostname
  });
}

// Delete the cookie written by
// setOneDayUnsecuredCookieWithMillisecondsSinceEpoch.
async function deleteUnsecuredCookieWithDomainAndPath() {
  await cookieStore.delete('LEGACYCOOKIENAME', {
    path: kPath,
    secure: false,
    domain: location.hostname
  });
}


// Set the secured example.org-domain cookie __Secure-COOKIENAME with
// value cookie-value on path /cgi-bin/ and expiration in June of next
// year; domain and path will be rewritten below.
//
// This uses an HTTP-style date string for expiration.
async function setSecureCookieWithHttpLikeExpirationString() {
  const year = (new Date()).getUTCFullYear() + 1;
  const date = new Date('07 Jun ' + year + ' 07:07:07 UTC');
  const day = ('Sun Mon Tue Wed Thu Fri Sat'.split(' '))[date.getUTCDay()];
  await cookieStore.set('__Secure-COOKIENAME', 'cookie-value', {
    path: kPath,
    expires: day + ', 07 Jun ' + year + ' 07:07:07 GMT',
    secure: true,
    domain: location.hostname
  });
}

// Set an already-expired cookie.
async function setExpiredSecureCookieWithDomainPathAndFallbackValue() {
  let theVeryRecentPast = Date.now();
  let expiredCookieSentinelValue = 'EXPIRED';
  await cookieStore.set('__Secure-COOKIENAME', expiredCookieSentinelValue, {
    path: kPath,
    expires: theVeryRecentPast,
    secure: true,
    domain: location.hostname
  });
}

// Delete the __Host-COOKIENAME cookie created above.
async function deleteSimpleOriginCookie() {
  await cookieStore.delete('__Host-COOKIENAME');
}

// Delete the __Secure-COOKIENAME cookie created above.
async function deleteSecureCookieWithDomainAndPath() {
  await cookieStore.delete('__Secure-COOKIENAME', {
    path: kPath,
    domain: location.hostname,
    secure: true
  });
}

// Observe the next 'change' event on the cookieStore. Typical usage:
//
//   const eventPromise = observeNextCookieChangeEvent();
//   await /* something that modifies cookies */
//   await verifyCookieChangeEvent(
//     eventPromise, {changed: [{name: 'name', value: 'value'}]});
//
function observeNextCookieChangeEvent() {
  return new Promise(resolve => {
    cookieStore.addEventListener('change', e => resolve(e), {once: true});
  });
}

async function verifyCookieChangeEvent(eventPromise, expected, description) {
  description = description ? description + ': ' : '';
  expected = Object.assign({changed:[], deleted:[]}, expected);
  const event = await eventPromise;
  assert_equals(event.changed.length, expected.changed.length,
               description + 'number of changed cookies');
  for (let i = 0; i < event.changed.length; ++i) {
    assert_equals(event.changed[i].name, expected.changed[i].name,
                 description + 'changed cookie name');
    assert_equals(event.changed[i].value, expected.changed[i].value,
                 description + 'changed cookie value');
  }
  assert_equals(event.deleted.length, expected.deleted.length,
               description + 'number of deleted cookies');
  for (let i = 0; i < event.deleted.length; ++i) {
    assert_equals(event.deleted[i].name, expected.deleted[i].name,
                 description + 'deleted cookie name');
    assert_equals(event.deleted[i].value, expected.deleted[i].value,
                 description + 'deleted cookie value');
  }
}

async function cookie_test(func, description) {

  // Wipe cookies used by tests before and after the test.
  async function deleteTestCookies() {
    await cookieStore.delete('');
    await cookieStore.delete('TEST');
    await cookieStore.delete('META-🍪');
    await cookieStore.delete('DOCUMENT-🍪');
    await cookieStore.delete('HTTP-🍪');
    await setCookieStringHttp(
      'HTTPONLY-🍪=DELETED; path=/; max-age=0; httponly');
    if (!kIsUnsecured) {
      await cookieStore.delete('__Host-COOKIENAME');
      await cookieStore.delete('__Host-1🍪');
      await cookieStore.delete('__Host-2🌟');
      await cookieStore.delete('__Host-3🌱');
      await cookieStore.delete('__Host-unordered1🍪');
      await cookieStore.delete('__Host-unordered2🌟');
      await cookieStore.delete('__Host-unordered3🌱');
    }
  }

  return promise_test(async t => {
    await deleteTestCookies();
    try {
      return await func(t);
    } finally {
      await deleteTestCookies();
    }
  }, description);
}
