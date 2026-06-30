const { getDefaultConfig } = require('expo/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

// Add support for .cjs files used by Firebase packages
defaultConfig.resolver.sourceExts = [...defaultConfig.resolver.sourceExts, 'cjs'];

// Disable unstable package exports handling if needed
defaultConfig.resolver.unstable_enablePackageExports = false;

module.exports = defaultConfig;
