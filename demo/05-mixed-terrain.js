"use strict";
// ============================================================
//  Code Cat Demo: Mixed Terrain
//  — A bit of everything: dense blocks, gaps, islands, stairs
//  — Best for general testing!
// ============================================================
// --- Dense header ---
const readFileSync = (p) => p;
const join = (...args) => args.join("/");
const createServer = (handler) => ({ listen: () => { } });
// --- Short staircase ---
function initApp() { return true; }
function loadConfig() { return {}; }
function startServer() { return 8080; }
// --- Gap ---
// --- Island hopping ---
const alpha = "left";
const beta = "center";
const gamma = "right";
// --- Another gap ---
// --- Dense processing block ---
class DataProcessor {
    constructor() {
        this.buffer = [];
        this.count = 0;
    }
    process(input) {
        this.buffer.push(input);
        this.count++;
        const result = this.buffer.join(", ");
        this.buffer = [];
        return `Processed ${this.count}: ${result}`;
    }
    getStats() {
        return { total: this.count, pending: this.buffer.length };
    }
}
// --- Long run lines ---
function checkAuthorizationTokenAndValidatePermissionsForCurrentUser______________________() {
    return { authorized: true, permissions: ["read", "write"] };
}
// ============================================================
//  Tips:
//  - Wait 5s idle → cat appears (visible area only!)
//  - Fish spawns after 8s → cat chases it
//  - Type anything → cat vanishes
//  - Scroll → terrain updates to visible range
//  - Cmd+, → search "Code Cat" → change settings
// ============================================================
//# sourceMappingURL=05-mixed-terrain.js.map