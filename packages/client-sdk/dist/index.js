"use strict";
/**
 * @pact/client-sdk
 *
 * Client SDK for Pact - handles file reading, git operations,
 * coverage collection, and API communication.
 *
 * Zero dependency on NestJS - uses only Node.js built-ins and fetch.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatCheckResult = exports.createCheckCommand = exports.check = exports.createPullCommand = exports.pull = exports.MainCacheStore = exports.MainCache = exports.PatchApplicator = exports.CoverageCollector = exports.GitClient = exports.FileReader = exports.PactApiClient = exports.createPactClient = exports.PactClient = void 0;
// Main client
var client_1 = require("./client");
Object.defineProperty(exports, "PactClient", { enumerable: true, get: function () { return client_1.PactClient; } });
Object.defineProperty(exports, "createPactClient", { enumerable: true, get: function () { return client_1.createPactClient; } });
// API client
var api_client_1 = require("./api-client");
Object.defineProperty(exports, "PactApiClient", { enumerable: true, get: function () { return api_client_1.PactApiClient; } });
// File operations
var file_reader_1 = require("./file-reader");
Object.defineProperty(exports, "FileReader", { enumerable: true, get: function () { return file_reader_1.FileReader; } });
var git_client_1 = require("./git-client");
Object.defineProperty(exports, "GitClient", { enumerable: true, get: function () { return git_client_1.GitClient; } });
// Coverage
var coverage_collector_1 = require("./coverage-collector");
Object.defineProperty(exports, "CoverageCollector", { enumerable: true, get: function () { return coverage_collector_1.CoverageCollector; } });
// Patch application
var patch_applicator_1 = require("./patch-applicator");
Object.defineProperty(exports, "PatchApplicator", { enumerable: true, get: function () { return patch_applicator_1.PatchApplicator; } });
// Main cache
var main_cache_1 = require("./main-cache");
Object.defineProperty(exports, "MainCache", { enumerable: true, get: function () { return main_cache_1.MainCache; } });
var main_cache_store_1 = require("./main-cache-store");
Object.defineProperty(exports, "MainCacheStore", { enumerable: true, get: function () { return main_cache_store_1.MainCacheStore; } });
// Commands
var pull_1 = require("./commands/pull");
Object.defineProperty(exports, "pull", { enumerable: true, get: function () { return pull_1.pull; } });
Object.defineProperty(exports, "createPullCommand", { enumerable: true, get: function () { return pull_1.createPullCommand; } });
var check_1 = require("./commands/check");
Object.defineProperty(exports, "check", { enumerable: true, get: function () { return check_1.check; } });
Object.defineProperty(exports, "createCheckCommand", { enumerable: true, get: function () { return check_1.createCheckCommand; } });
Object.defineProperty(exports, "formatCheckResult", { enumerable: true, get: function () { return check_1.formatCheckResult; } });
// Types
__exportStar(require("./types"), exports);
