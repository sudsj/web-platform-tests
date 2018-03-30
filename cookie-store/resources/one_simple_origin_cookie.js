'use strict';

cookie_test(async testCase => {
  await promise_rejects_when_unsecured(
    testCase,
    new TypeError(),
    setOneSimpleOriginSessionCookie(),
    '__Host- prefix only writable from secure contexts');
  if (!kIsUnsecured) {
    assert_equals(
      await getOneSimpleOriginCookie(),
      'cookie-value',
      '__Host-COOKIENAME cookie should be found in a secure context');
  } else {
    assert_equals(
      await getOneSimpleOriginCookie(),
      undefined,
      '__Host-COOKIENAME cookie should not be found in an unsecured context');
  }
  if (kIsUnsecured) {
    assert_equals(
      await countMatchingSimpleOriginCookies(),
      0,
      'No __Host-COOKIEN* cookies should be found in an unsecured context');
  } else {
    assert_equals(
      await countMatchingSimpleOriginCookies(),
      1,
      'One __Host-COOKIEN* cookie should be found in a secure context');
  }
}, 'One simple origin cookie');
