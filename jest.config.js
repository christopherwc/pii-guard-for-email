module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/test/**/*.test.js'],
  collectCoverageFrom: ['src/**/*.js', '!src/**/content.js', '!src/**/background.js'],
};
