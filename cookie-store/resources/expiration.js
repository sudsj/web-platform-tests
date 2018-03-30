'use strict';

cookie_test(async testCase => {
  await promise_rejects_when_unsecured(
    testCase,
    new TypeError(),
    setOneDaySecureCookieWithDate(),
    'Secure cookies only writable from secure contexts');

  const eventPromise = observeNextCookieChangeEvent();

  await setOneDayUnsecuredCookieWithMillisecondsSinceEpoch();
  assert_equals(
      await getCookieString('LEGACYCOOKIENAME'),
      'LEGACYCOOKIENAME=cookie-value',
      'Ensure unsecured cookie we set is visible');

  await verifyCookieChangeEvent(
    eventPromise,
    {changed: [{name: 'LEGACYCOOKIENAME', value: 'cookie-value'}]},
    'Ensure unsecured cookie we set is visible to observer');

  await deleteUnsecuredCookieWithDomainAndPath();
  await promise_rejects_when_unsecured(
      testCase,
      new TypeError(),
      setSecureCookieWithHttpLikeExpirationString(),
      'Secure cookies only writable from secure contexts');
}, 'expiration');
