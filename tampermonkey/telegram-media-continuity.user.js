// ==UserScript==
// @name         Telegram Web A 媒体续播
// @namespace    telegram-air/media-continuity
// @version      0.1.0
// @description  为 Telegram Web A 提供频道媒体续播与自动连续播放能力
// @match        https://web.telegram.org/a/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const SCRIPT_ID = 'telegram-media-continuity';

  function initializeScript() {
    if (document.documentElement.dataset[SCRIPT_ID]) return;

    document.documentElement.dataset[SCRIPT_ID] = 'ready';
    console.info('[Telegram Media Continuity] Script initialized');
  }

  initializeScript();
})();
