module.exports = {
  default: {
    require: ['test/features/step-definitions/**/*.ts'],
    requireModule: ['ts-node/register'],
    format: ['progress', 'html:test/reports/cucumber-report.html'],
    paths: ['test/features/**/*.feature'],
  },
};
