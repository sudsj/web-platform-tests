'use strict';

// https://github.com/whatwg/html/issues/3076#issuecomment-332920132
// proposes to remove <meta http-equiv="set-cookie" ... > but it is
// not yet an accepted part of the HTML spec.
//
// Until the feature is gone, it interacts with other cookie APIs,
// including this one.
//
cookie_test(async t => {
  let eventPromise = observeNextCookieChangeEvent();
  await setCookieStringMeta('META-🍪=🔵; path=/');
  if (kMetaHttpEquivSetCookieIsGone) {
    assert_equals(
        await getCookieString(),
        undefined,
        'Empty cookie jar after no-longer-supported' +
          ' <meta http-equiv="set-cookie" ... >');
    assert_equals(
      await getCookieStringHttp(),
      undefined,
      'Empty HTTP cookie jar after no-longer-supported' +
        ' <meta http-equiv="set-cookie" ... >');

    // No event expected, so make a dummy change to ensure nothing is queued.
    await cookieStore.set('TEST', 'dummy');
    await verifyCookieChangeEvent(
      eventPromise,
      {changed: [{name: 'TEST', value: 'dummy'}]},
      'No cookie change observed after no-longer-supported' +
          ' <meta http-equiv="set-cookie" ... >');
  } else {
    assert_equals(
        await getCookieString(),
        'META-🍪=🔵',
        'Cookie we wrote using' +
          ' <meta http-equiv="set-cookie" ... > in cookie jar');
    assert_equals(
      await getCookieStringHttp(),
      'META-🍪=🔵',
      'Cookie we wrote using' +
        ' <meta http-equiv="set-cookie" ... > in HTTP cookie jar');

    await verifyCookieChangeEvent(
      eventPromise,
      {changed: [{name: 'META-🍪', value: '🔵'}]},
      'Cookie we wrote using' +
        ' <meta http-equiv="set-cookie" ... > is observed');

    let eventPromise = observeNextCookieChangeEvent();
    await setCookieStringMeta('META-🍪=DELETED; path=/; max-age=0');
    assert_equals(
        await getCookieString(),
        undefined,
        'Empty cookie jar after <meta http-equiv="set-cookie" ... >' +
          ' cookie-clearing using max-age=0');
    assert_equals(
      await getCookieStringHttp(),
      undefined,
      'Empty HTTP cookie jar after <meta http-equiv="set-cookie" ... >' +
        ' cookie-clearing using max-age=0');

    await verifyCookieChangeEvent(
      eventPromise,
      {deleted: [{name: 'META-🍪'}]},
      'Obseved deletion after <meta http-equiv="set-cookie" ... >' +
        ' cookie-clearing using max-age=0');
  }
}, 'Verify <meta http-equiv="set-cookie" ... > interoperability.');
