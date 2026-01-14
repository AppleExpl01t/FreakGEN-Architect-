'use strict';

const rInt = (max) => Math.floor(Math.random() * max);
const rVal = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const getTime = (minMs, maxMs) => {
    let val = rVal(minMs, maxMs);
    return val >= 1000 ? (val / 1000).toFixed(2) + "s" : val + "ms";
};

// Tooltip Logic (moved here for cleaner script.js if possible, or just Utils)
// Since tooltip logic is DOM heavy, maybe keep it in script.js or pass dependencies.
// Let's keep DOM logic in script.js for now and only move pure functions.

module.exports = {
    rInt,
    rVal,
    getTime
};
