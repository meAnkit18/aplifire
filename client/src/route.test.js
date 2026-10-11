import { routeFor } from './route.js';
test('maps #/privacy to privacy', () => { expect(routeFor('#/privacy')).toBe('privacy'); });
test('maps anything else to main', () => {
  expect(routeFor('')).toBe('main');
  expect(routeFor('#/')).toBe('main');
  expect(routeFor('#/other')).toBe('main');
});
