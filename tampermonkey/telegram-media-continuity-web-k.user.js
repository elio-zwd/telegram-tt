// ==UserScript==
// @name         Telegram Web K 媒体续播（兼容验证版）
// @namespace    telegram-air/media-continuity
// @version      0.4.0-k9
// @description  为 Telegram Web K 提供图片和视频连续浏览能力
// @match        https://web.telegram.org/k/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==
// 此文件由构建生成，请勿直接手工修改。
// 请修改 tampermonkey/src/web-k/** 后运行 `npm run build:tampermonkey:web-k`。
(function() {
	//#region tampermonkey/src/web-k/core/runtime.js
	var runtime = {
		session: void 0,
		observer: void 0,
		scanTimer: 0,
		periodicTimer: 0,
		debugEnabled: false,
		lastSourceProbe: void 0,
		closeProbe: void 0,
		closeProbeInternal: void 0,
		closeProbeTimer: 0,
		closeProbeCleanup: [],
		lastSourceTarget: void 0,
		closeSequenceId: 0,
		activeLocationSequenceId: 0,
		locationTimers: /* @__PURE__ */ new Set(),
		lastLocationResult: void 0
	};
	//#endregion
	//#region tampermonkey/src/web-k/core/lifecycle.js
	var SCAN_DELAY_MS = 160;
	var PERIODIC_SCAN_MS = 1e3;
	var INITIALIZED_MARKER = "web-k-ready";
	function createLifecycle({ captureSourceTarget, clearCloseProbe, clearLocationTimers, createSession, findMediaViewer, installDebugApi, isElementVisible, locateMessageAfterClose }) {
		function scanPage() {
			runtime.scanTimer = 0;
			if (runtime.session && (!runtime.session.viewer.isConnected || !isElementVisible(runtime.session.viewer))) {
				const closeSnapshot = runtime.session.createCloseSnapshot();
				runtime.session.destroy();
				runtime.session = void 0;
				locateMessageAfterClose(closeSnapshot);
			}
			const viewer = findMediaViewer();
			if (!viewer) return;
			if (runtime.session && runtime.session.viewer === viewer) {
				runtime.session.requestRefresh();
				return;
			}
			if (runtime.session) runtime.session.destroy();
			clearLocationTimers();
			runtime.activeLocationSequenceId += 1;
			runtime.session = createSession(viewer);
		}
		function scheduleScan() {
			if (runtime.scanTimer) return;
			runtime.scanTimer = window.setTimeout(scanPage, SCAN_DELAY_MS);
		}
		function handlePageHide() {
			clearCloseProbe();
			clearLocationTimers();
			runtime.activeLocationSequenceId += 1;
			document.removeEventListener("pointerdown", captureSourceTarget, true);
			runtime.session?.destroy();
		}
		function initializeScript() {
			if (document.documentElement.dataset.telegramMediaContinuity === INITIALIZED_MARKER) return;
			document.documentElement.dataset.telegramMediaContinuity = INITIALIZED_MARKER;
			runtime.debugEnabled = /(?:[?#&])ttMediaDebug=1(?:&|$)/.test(location.href);
			installDebugApi(scheduleScan);
			document.addEventListener("pointerdown", captureSourceTarget, true);
			runtime.observer = new MutationObserver(scheduleScan);
			runtime.observer.observe(document.body || document.documentElement, {
				childList: true,
				subtree: true
			});
			runtime.periodicTimer = window.setInterval(() => {
				if (runtime.session) runtime.session.requestRefresh();
				else scheduleScan();
			}, PERIODIC_SCAN_MS);
			window.addEventListener("pagehide", handlePageHide);
			window.addEventListener("popstate", scheduleScan);
			window.addEventListener("hashchange", scheduleScan);
			scheduleScan();
			console.info("[Telegram Media Continuity] Web K script initialized");
		}
		return Object.freeze({
			initializeScript,
			scheduleScan
		});
	}
	//#endregion
	//#region tampermonkey/src/web-k/core/logger.js
	function debugLog(message, data) {
		if (!runtime.debugEnabled) return;
		if (data === void 0) console.debug(`[Telegram Media Continuity] ${message}`);
		else console.debug(`[Telegram Media Continuity] ${message}`, data);
	}
	//#endregion
	//#region tampermonkey/src/web-k/platform/dom.js
	var MESSAGE_ID_ATTRIBUTES = Object.freeze([
		"data-mid",
		"data-message-id",
		"data-msg-id",
		"data-message"
	]);
	var PEER_ID_ATTRIBUTES = Object.freeze(["data-peer-id", "data-peer"]);
	var NUMERIC_DATA_ATTRIBUTES = Object.freeze([
		...MESSAGE_ID_ATTRIBUTES,
		...PEER_ID_ATTRIBUTES,
		"data-index",
		"data-media-index"
	]);
	function isElementVisible(element) {
		if (!(element instanceof Element) || !element.isConnected) return false;
		const rect = element.getBoundingClientRect();
		if (rect.width < 1 || rect.height < 1) return false;
		const style = getComputedStyle(element);
		return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && element.getAttribute("aria-hidden") !== "true" && !element.hasAttribute("hidden");
	}
	function getNumericDataAttributes(element) {
		if (!(element instanceof Element)) return {};
		const result = {};
		for (const attributeName of NUMERIC_DATA_ATTRIBUTES) {
			const value = element.getAttribute(attributeName);
			if (value && /^-?\d+$/.test(value)) result[attributeName] = value;
		}
		return result;
	}
	function describeElement(element) {
		if (!(element instanceof Element)) return void 0;
		const rect = element.getBoundingClientRect();
		return {
			tag: element.tagName.toLowerCase(),
			classNames: Array.from(element.classList).slice(0, 12),
			role: element.getAttribute("role") || "",
			hasAriaLabel: element.hasAttribute("aria-label"),
			hasTitle: element.hasAttribute("title"),
			hasHref: element instanceof HTMLAnchorElement && element.hasAttribute("href"),
			dataAttributeNames: Array.from(element.attributes).filter((attribute) => attribute.name.startsWith("data-")).slice(0, 16).map((attribute) => attribute.name),
			numericDataAttributes: getNumericDataAttributes(element),
			rect: {
				width: Math.round(rect.width),
				height: Math.round(rect.height),
				left: Math.round(rect.left),
				top: Math.round(rect.top)
			},
			imageCount: element.querySelectorAll("img").length,
			videoCount: element.querySelectorAll("video").length,
			buttonCount: element.querySelectorAll("button, [role=\"button\"]").length
		};
	}
	function classifyUrlToken(value) {
		if (!value) return "empty";
		if (/^-?\d+$/.test(value)) return "number";
		return "text";
	}
	function describeHrefPattern(element) {
		if (!(element instanceof HTMLAnchorElement) || !element.hasAttribute("href")) return void 0;
		try {
			const url = new URL(element.href, location.href);
			const hashPath = url.hash.split("?")[0].replace(/^#/, "");
			return {
				protocol: url.protocol,
				host: [
					"web.telegram.org",
					"t.me",
					"telegram.me"
				].includes(url.hostname) ? url.hostname : "other",
				pathPattern: url.pathname.split("/").filter(Boolean).slice(0, 8).map(classifyUrlToken),
				hashPattern: hashPath.split("/").filter(Boolean).slice(0, 8).map(classifyUrlToken),
				queryKeys: Array.from(url.searchParams.keys()).slice(0, 12),
				hashQueryKeys: url.hash.includes("?") ? Array.from(new URLSearchParams(url.hash.slice(url.hash.indexOf("?") + 1)).keys()).slice(0, 12) : []
			};
		} catch (error) {
			return { invalid: true };
		}
	}
	function describeControl(element) {
		const description = describeElement(element);
		if (!description) return void 0;
		return {
			...description,
			hasSvg: Boolean(element.querySelector("svg")),
			hrefPattern: describeHrefPattern(element)
		};
	}
	function findScrollableAncestor(element) {
		let current = element instanceof Element ? element.parentElement : void 0;
		while (current && current !== document.body && current !== document.documentElement) {
			const style = getComputedStyle(current);
			if (/(auto|scroll|overlay)/.test(style.overflowY) && current.scrollHeight > current.clientHeight + 2) return current;
			current = current.parentElement;
		}
	}
	//#endregion
	//#region tampermonkey/src/web-k/platform/media-viewer.js
	var mediaNodeIds = /* @__PURE__ */ new WeakMap();
	var nextMediaNodeId = 1;
	function findMediaViewer() {
		const viewer = document.querySelector(".media-viewer-whole");
		return isElementVisible(viewer) ? viewer : void 0;
	}
	function findMediaRoot(viewer) {
		return viewer.querySelector(".media-viewer-movers") || viewer;
	}
	function mediaScore(media, rootRect) {
		if (!isElementVisible(media)) return -Infinity;
		const rect = media.getBoundingClientRect();
		if (rect.width < 80 || rect.height < 60) return -Infinity;
		const rootCenterX = rootRect.left + rootRect.width / 2;
		const rootCenterY = rootRect.top + rootRect.height / 2;
		const mediaCenterX = rect.left + rect.width / 2;
		const mediaCenterY = rect.top + rect.height / 2;
		const distance = Math.hypot(mediaCenterX - rootCenterX, mediaCenterY - rootCenterY);
		let score = Math.min(rect.width * rect.height / 1e3, 1200) - distance;
		if (media instanceof HTMLVideoElement && !media.paused) score += 300;
		if (rect.left <= rootCenterX && rect.right >= rootCenterX && rect.top <= rootCenterY && rect.bottom >= rootCenterY) score += 500;
		return score;
	}
	function findActiveMedia(viewer) {
		const root = findMediaRoot(viewer);
		const rootRect = root.getBoundingClientRect();
		let best;
		let bestScore = -Infinity;
		for (const media of root.querySelectorAll("img, video")) {
			const score = mediaScore(media, rootRect);
			if (score > bestScore) {
				bestScore = score;
				best = media;
			}
		}
		return best;
	}
	function getMediaType(media) {
		if (media instanceof HTMLImageElement) return "images";
		if (media instanceof HTMLVideoElement) return "videos";
	}
	function getMediaNodeId(media) {
		if (!mediaNodeIds.has(media)) {
			mediaNodeIds.set(media, nextMediaNodeId);
			nextMediaNodeId += 1;
		}
		return mediaNodeIds.get(media);
	}
	function mediaFingerprint(media) {
		if (!media) return "none";
		const source = media.currentSrc || media.src || "";
		const size = media instanceof HTMLVideoElement ? `${media.videoWidth}x${media.videoHeight}` : `${media.naturalWidth}x${media.naturalHeight}`;
		return `${media.tagName}|${getMediaNodeId(media)}|${size}|${source.slice(-120)}`;
	}
	function isMediaSuccessfullyDisplayed(media) {
		if (!isElementVisible(media)) return false;
		if (media instanceof HTMLImageElement) return media.complete && media.naturalWidth > 0;
		if (media instanceof HTMLVideoElement) return media.readyState >= HTMLMediaElement.HAVE_METADATA || media.videoWidth > 0 || media.videoHeight > 0;
		return false;
	}
	function isMediaZoomed(viewer) {
		return viewer.classList.contains("is-zooming");
	}
	//#endregion
	//#region tampermonkey/src/web-k/platform/message-list.js
	var CHAT_SCROLL_SELECTOR = ".scrollable.scrollable-y.bubbles-scrollable";
	function findMessageNode(target) {
		let current = target instanceof Element ? target : void 0;
		for (let depth = 0; current && depth < 14; depth += 1) {
			if (MESSAGE_ID_ATTRIBUTES.some((attributeName) => {
				const value = current.getAttribute(attributeName);
				return Boolean(value && /^-?\d+$/.test(value));
			})) return current;
			current = current.parentElement;
		}
	}
	function getMessageIdentity(messageNode) {
		if (!(messageNode instanceof Element)) return void 0;
		let messageId = "";
		let peerId = "";
		for (const attributeName of MESSAGE_ID_ATTRIBUTES) {
			const value = messageNode.getAttribute(attributeName);
			if (value && /^-?\d+$/.test(value)) {
				messageId = value;
				break;
			}
		}
		for (const attributeName of PEER_ID_ATTRIBUTES) {
			const value = messageNode.getAttribute(attributeName);
			if (value && /^-?\d+$/.test(value)) {
				peerId = value;
				break;
			}
		}
		return messageId ? {
			messageId,
			peerId
		} : void 0;
	}
	function findMediaFromTarget(target, messageNode, point) {
		if (!(target instanceof Element) || !(messageNode instanceof Element)) return void 0;
		if (target.matches("img, video")) return target;
		let current = target;
		while (current && current !== messageNode) {
			const media = current.querySelectorAll("img, video");
			if (media.length === 1) return media[0];
			current = current.parentElement;
		}
		const candidates = Array.from(messageNode.querySelectorAll("img, video")).filter((item) => {
			const rect = item.getBoundingClientRect();
			return rect.width >= 32 && rect.height >= 32;
		});
		if (point && Number.isFinite(point.x) && Number.isFinite(point.y)) {
			const hit = candidates.find((item) => {
				const rect = item.getBoundingClientRect();
				return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
			});
			if (hit) return hit;
		}
		return candidates.length === 1 ? candidates[0] : void 0;
	}
	function getProbeAlbumIndex(messageNode, media) {
		if (!(messageNode instanceof Element) || !(media instanceof Element)) return 0;
		const index = Array.from(messageNode.querySelectorAll("img, video")).filter((item) => {
			const rect = item.getBoundingClientRect();
			return rect.width >= 32 && rect.height >= 32;
		}).indexOf(media);
		return index >= 0 ? index : 0;
	}
	function captureSourceTarget(event, scriptId) {
		const target = event.target;
		if (!(target instanceof Element) || target.closest(`#${scriptId}`) || findMediaViewer()) return void 0;
		const result = { shouldCancelLocation: true };
		const messageNode = findMessageNode(target);
		const identity = getMessageIdentity(messageNode);
		if (!messageNode || !identity) return result;
		const media = findMediaFromTarget(target, messageNode, {
			x: event.clientX,
			y: event.clientY
		});
		if (!media) return result;
		const ancestorChain = [];
		let current = target;
		for (let depth = 0; current && current !== messageNode && depth < 6; depth += 1) {
			ancestorChain.push(describeElement(current));
			current = current.parentElement;
		}
		ancestorChain.push(describeElement(messageNode));
		const capturedAt = Date.now();
		const albumIndex = getProbeAlbumIndex(messageNode, media);
		return {
			...result,
			probe: {
				capturedAt,
				identity,
				albumIndex,
				mediaTag: media.tagName.toLowerCase(),
				messageNode: describeElement(messageNode),
				targetAncestors: ancestorChain.filter(Boolean)
			},
			target: identity.peerId ? {
				capturedAt,
				peerKey: identity.peerId,
				messageKey: identity.messageId,
				albumIndex,
				source: "source-message",
				confidence: "high",
				sourceMessageNode: messageNode
			} : void 0
		};
	}
	function cloneMediaTarget(target) {
		if (!target) return void 0;
		return {
			capturedAt: target.capturedAt || Date.now(),
			peerKey: String(target.peerKey || ""),
			messageKey: String(target.messageKey || ""),
			albumIndex: Number.isInteger(target.albumIndex) ? target.albumIndex : 0,
			source: target.source || "source-message",
			confidence: target.confidence || "high",
			confirmedAt: target.confirmedAt || 0,
			mediaFingerprint: target.mediaFingerprint || "",
			sourceMessageNode: target.sourceMessageNode
		};
	}
	function isChatMediaNode(node) {
		if (!(node instanceof Element) || node.classList.contains("pinned-message")) return false;
		if (!getMessageIdentity(node)?.peerId || !node.closest(CHAT_SCROLL_SELECTOR)) return false;
		if (node.classList.contains("album-item")) return true;
		if (!node.classList.contains("bubble")) return false;
		if (node.querySelector(":scope .album-item[data-mid][data-peer-id]")) return false;
		return node.classList.contains("photo") || node.classList.contains("video") || node.classList.contains("is-gif") || node.classList.contains("document");
	}
	function getAlbumItemIndex(node) {
		if (!(node instanceof Element) || !node.classList.contains("album-item")) return 0;
		const parent = node.parentElement;
		if (!parent) return 0;
		const index = Array.from(parent.children).filter((item) => item.classList?.contains("album-item")).indexOf(node);
		return index >= 0 ? index : 0;
	}
	function createTargetFromMessageNode(node) {
		const identity = getMessageIdentity(node);
		if (!identity?.messageId || !identity.peerId) return void 0;
		return {
			capturedAt: Date.now(),
			peerKey: identity.peerId,
			messageKey: identity.messageId,
			albumIndex: getAlbumItemIndex(node),
			source: "source-message",
			confidence: "high",
			confirmedAt: 0,
			mediaFingerprint: "",
			sourceMessageNode: node
		};
	}
	function findActiveChatScrollContainer() {
		const candidates = Array.from(document.querySelectorAll(CHAT_SCROLL_SELECTOR)).filter(isElementVisible);
		candidates.sort((left, right) => {
			const leftRect = left.getBoundingClientRect();
			const rightRect = right.getBoundingClientRect();
			return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
		});
		return candidates[0];
	}
	function collectOrderedChatMediaTargets(peerKey) {
		const container = findActiveChatScrollContainer();
		if (!container || !peerKey) return [];
		const nodes = Array.from(container.querySelectorAll("[data-mid][data-peer-id]")).filter((node) => isChatMediaNode(node) && getMessageIdentity(node)?.peerId === peerKey);
		nodes.sort((left, right) => {
			if (left === right) return 0;
			return left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
		});
		return nodes.map(createTargetFromMessageNode).filter(Boolean);
	}
	function findTargetIndex(targets, target) {
		if (!target) return -1;
		const nodeIndex = targets.findIndex((candidate) => candidate.sourceMessageNode === target.sourceMessageNode);
		if (nodeIndex >= 0) return nodeIndex;
		return targets.findIndex((candidate) => candidate.peerKey === target.peerKey && candidate.messageKey === target.messageKey);
	}
	function findAdjacentMediaTarget(target, direction) {
		if (!target || !direction) return void 0;
		const targets = collectOrderedChatMediaTargets(target.peerKey);
		const index = findTargetIndex(targets, target);
		if (index < 0) return void 0;
		return cloneMediaTarget(targets[index + (direction > 0 ? 1 : -1)]);
	}
	function getActiveChatPeerKey(container) {
		if (!(container instanceof Element)) return "";
		const counts = /* @__PURE__ */ new Map();
		for (const node of container.querySelectorAll("[data-mid][data-peer-id]")) {
			const identity = getMessageIdentity(node);
			if (!identity?.peerId || node.classList.contains("pinned-message")) continue;
			counts.set(identity.peerId, (counts.get(identity.peerId) || 0) + 1);
		}
		let bestKey = "";
		let bestCount = 0;
		for (const [peerKey, count] of counts) if (count > bestCount) {
			bestKey = peerKey;
			bestCount = count;
		}
		return bestKey;
	}
	function findExactMessageNode(target) {
		const container = findActiveChatScrollContainer();
		if (!container || !target?.messageKey) return { reason: "chat-not-ready" };
		const activePeerKey = getActiveChatPeerKey(container);
		if (target.peerKey && activePeerKey && target.peerKey !== activePeerKey) return {
			reason: "peer-changed",
			container
		};
		const sourceNode = target.sourceMessageNode;
		if (sourceNode instanceof Element && sourceNode.isConnected && container.contains(sourceNode)) {
			const identity = getMessageIdentity(sourceNode);
			if (identity?.messageId === target.messageKey && (!target.peerKey || identity.peerId === target.peerKey)) return {
				node: sourceNode.classList.contains("album-item") ? sourceNode.closest(".bubble") || sourceNode : sourceNode,
				container,
				reason: "source-node"
			};
		}
		const escapedMessageKey = globalThis.CSS?.escape ? CSS.escape(target.messageKey) : target.messageKey.replace(/[^-\d]/g, "");
		const matches = Array.from(container.querySelectorAll(`[data-mid="${escapedMessageKey}"]`)).filter((node) => {
			const identity = getMessageIdentity(node);
			return identity?.messageId === target.messageKey && (!target.peerKey || identity.peerId === target.peerKey) && !node.classList.contains("pinned-message");
		});
		const identityNode = matches.find((node) => node.classList.contains("album-item")) || matches.find((node) => node.classList.contains("bubble")) || matches[0];
		const displayNode = identityNode?.classList.contains("album-item") ? identityNode.closest(".bubble") || identityNode : identityNode;
		return displayNode ? {
			node: displayNode,
			container,
			reason: "exact-dom-match"
		} : {
			container,
			reason: "not-loaded"
		};
	}
	function collectMessageNodes() {
		const selector = MESSAGE_ID_ATTRIBUTES.map((name) => `[${name}]`).join(", ");
		const nodes = [];
		const seen = /* @__PURE__ */ new Set();
		for (const element of document.querySelectorAll(selector)) {
			if (!getMessageIdentity(element) || seen.has(element)) continue;
			seen.add(element);
			nodes.push(element);
			if (nodes.length >= 600) break;
		}
		return nodes;
	}
	//#endregion
	//#region tampermonkey/src/web-k/features/close-position/message-locator.js
	var LOCATION_WAIT_TIMEOUT_MS = 2400;
	var LOCATION_POLL_MS = 80;
	var LOCATION_REVIEW_DELAY_MS = 420;
	var LOCATION_HIGHLIGHT_MS = 1200;
	var LOCATION_STYLE_ID = "telegram-media-continuity-location-style";
	var LOCATION_HIGHLIGHT_CLASS = "tt-media-continuity-location-highlight";
	var LOCATION_NOTICE_ID = "telegram-media-continuity-location-notice";
	function ensureLocationStyle() {
		if (document.getElementById(LOCATION_STYLE_ID)) return;
		const style = document.createElement("style");
		style.id = LOCATION_STYLE_ID;
		style.textContent = `
    @keyframes ttMediaContinuityPulse {
      0% { box-shadow: 0 0 0 0 rgba(42, 171, 238, .7); }
      45% { box-shadow: 0 0 0 8px rgba(42, 171, 238, .18); }
      100% { box-shadow: 0 0 0 0 rgba(42, 171, 238, 0); }
    }
    .${LOCATION_HIGHLIGHT_CLASS} {
      animation: ttMediaContinuityPulse ${LOCATION_HIGHLIGHT_MS}ms ease-out !important;
    }
  `;
		(document.head || document.documentElement).appendChild(style);
	}
	function showLocationNotice(message) {
		document.getElementById(LOCATION_NOTICE_ID)?.remove();
		const notice = document.createElement("div");
		notice.id = LOCATION_NOTICE_ID;
		notice.setAttribute("role", "status");
		notice.textContent = message;
		notice.style.cssText = [
			"position:fixed",
			"left:50%",
			"bottom:24px",
			"transform:translateX(-50%)",
			"z-index:2147483647",
			"max-width:min(86vw,420px)",
			"padding:9px 14px",
			"border-radius:11px",
			"background:rgba(20,24,32,.92)",
			"color:#fff",
			"font:13px/1.4 -apple-system,BlinkMacSystemFont,\"Segoe UI\",sans-serif",
			"box-shadow:0 8px 28px rgba(0,0,0,.28)",
			"pointer-events:none"
		].join(";");
		document.body.appendChild(notice);
		window.setTimeout(() => notice.remove(), 1800);
	}
	function clearLocationTimers() {
		for (const timerId of runtime.locationTimers) window.clearTimeout(timerId);
		runtime.locationTimers.clear();
		for (const node of document.querySelectorAll(`.${LOCATION_HIGHLIGHT_CLASS}`)) node.classList.remove(LOCATION_HIGHLIGHT_CLASS);
	}
	function setLocationTimer(callback, delay) {
		const timerId = window.setTimeout(() => {
			runtime.locationTimers.delete(timerId);
			callback();
		}, delay);
		runtime.locationTimers.add(timerId);
		return timerId;
	}
	function recordLocationResult(sequenceId, status, target, extra = {}) {
		runtime.lastLocationResult = {
			sequenceId,
			status,
			finishedAt: Date.now(),
			target: target ? {
				peerKey: target.peerKey,
				messageKey: target.messageKey,
				albumIndex: target.albumIndex,
				confidence: target.confidence
			} : void 0,
			...extra
		};
		debugLog("关闭后定位结果", runtime.lastLocationResult);
	}
	function centerAndHighlightMessage(node, container, sequenceId, target) {
		ensureLocationStyle();
		node.scrollIntoView({
			block: "center",
			inline: "nearest",
			behavior: "smooth"
		});
		node.classList.remove(LOCATION_HIGHLIGHT_CLASS);
		node.offsetWidth;
		node.classList.add(LOCATION_HIGHLIGHT_CLASS);
		setLocationTimer(() => node.classList.remove(LOCATION_HIGHLIGHT_CLASS), LOCATION_HIGHLIGHT_MS);
		setLocationTimer(() => {
			if (runtime.activeLocationSequenceId !== sequenceId || !node.isConnected || !container.isConnected) return;
			const nodeRect = node.getBoundingClientRect();
			const containerRect = container.getBoundingClientRect();
			const delta = nodeRect.top + nodeRect.height / 2 - (containerRect.top + containerRect.height / 2);
			if (Math.abs(delta) > Math.min(120, containerRect.height * .18)) container.scrollTop += delta;
		}, LOCATION_REVIEW_DELAY_MS);
		recordLocationResult(sequenceId, "located", target, { source: "exact-dom-match" });
		showLocationNotice("已定位到最后查看消息");
	}
	function locateMessageAfterClose(snapshot) {
		if (!snapshot) return;
		clearLocationTimers();
		runtime.activeLocationSequenceId = snapshot.sequenceId;
		const startedAt = performance.now();
		if (!snapshot.target) {
			recordLocationResult(snapshot.sequenceId, snapshot.reason || "no-confirmed-target");
			showLocationNotice(snapshot.reason === "unmapped-current-media" ? "无法确认媒体所属消息，已正常关闭" : "最后查看消息当前未加载");
			return;
		}
		const poll = () => {
			if (runtime.activeLocationSequenceId !== snapshot.sequenceId) return;
			if (findMediaViewer()) {
				if (performance.now() - startedAt >= LOCATION_WAIT_TIMEOUT_MS) {
					recordLocationResult(snapshot.sequenceId, "viewer-still-visible", snapshot.target);
					return;
				}
				setLocationTimer(poll, LOCATION_POLL_MS);
				return;
			}
			const match = findExactMessageNode(snapshot.target);
			if (match.node && match.container) {
				centerAndHighlightMessage(match.node, match.container, snapshot.sequenceId, snapshot.target);
				return;
			}
			if (match.reason === "peer-changed") {
				recordLocationResult(snapshot.sequenceId, "cancelled-peer-changed", snapshot.target);
				return;
			}
			if (performance.now() - startedAt >= LOCATION_WAIT_TIMEOUT_MS) {
				recordLocationResult(snapshot.sequenceId, "target-not-loaded", snapshot.target);
				showLocationNotice("最后查看消息当前未加载");
				return;
			}
			setLocationTimer(poll, LOCATION_POLL_MS);
		};
		requestAnimationFrame(() => requestAnimationFrame(poll));
	}
	//#endregion
	//#region tampermonkey/src/web-k/features/close-position/target-tracker.js
	var SOURCE_TARGET_MAX_AGE_MS = 5e3;
	var TARGET_NAVIGATION_TIMEOUT_MS = 3e3;
	function captureSourceProbe(event, scriptId) {
		const captured = captureSourceTarget(event, scriptId);
		if (!captured) return;
		clearLocationTimers();
		runtime.activeLocationSequenceId += 1;
		if (!captured.probe) return;
		runtime.lastSourceProbe = captured.probe;
		runtime.lastSourceTarget = captured.target;
	}
	function takeRecentSourceTarget() {
		const target = runtime.lastSourceTarget;
		runtime.lastSourceTarget = void 0;
		if (!target || Date.now() - target.capturedAt > SOURCE_TARGET_MAX_AGE_MS) return void 0;
		if (!(target.sourceMessageNode instanceof Element) || !target.sourceMessageNode.isConnected) return void 0;
		const identity = getMessageIdentity(target.sourceMessageNode);
		if (!identity || identity.messageId !== target.messageKey || identity.peerId !== target.peerKey) return void 0;
		return cloneMediaTarget(target);
	}
	var MediaTargetTracker = class {
		constructor({ getCurrentFingerprint }) {
			this.getCurrentFingerprint = getCurrentFingerprint;
			this.pendingNavigationTimer = 0;
			this.pendingMediaTarget = takeRecentSourceTarget();
			this.lastConfirmedMediaTarget = void 0;
			this.currentMappingLost = false;
		}
		prepareNavigationTarget(direction) {
			const currentFingerprint = this.getCurrentFingerprint();
			const adjacentTarget = findAdjacentMediaTarget(this.pendingMediaTarget || this.lastConfirmedMediaTarget, direction);
			window.clearTimeout(this.pendingNavigationTimer);
			this.pendingNavigationTimer = 0;
			if (!adjacentTarget) {
				this.pendingMediaTarget = void 0;
				return false;
			}
			adjacentTarget.fromFingerprint = currentFingerprint;
			this.pendingMediaTarget = adjacentTarget;
			this.pendingNavigationTimer = window.setTimeout(() => {
				if (this.pendingMediaTarget?.fromFingerprint === this.getCurrentFingerprint()) this.pendingMediaTarget = void 0;
				this.pendingNavigationTimer = 0;
			}, TARGET_NAVIGATION_TIMEOUT_MS);
			return true;
		}
		clearPendingNavigation() {
			window.clearTimeout(this.pendingNavigationTimer);
			this.pendingNavigationTimer = 0;
			this.pendingMediaTarget = void 0;
		}
		confirmCurrentMediaTarget(currentMedia) {
			const currentFingerprint = this.getCurrentFingerprint();
			if (!isMediaSuccessfullyDisplayed(currentMedia)) return false;
			const pending = this.pendingMediaTarget;
			if (pending && (pending.fromFingerprint === void 0 || pending.fromFingerprint !== currentFingerprint)) {
				window.clearTimeout(this.pendingNavigationTimer);
				this.pendingNavigationTimer = 0;
				this.lastConfirmedMediaTarget = {
					...cloneMediaTarget(pending),
					confirmedAt: Date.now(),
					mediaFingerprint: currentFingerprint
				};
				this.pendingMediaTarget = void 0;
				this.currentMappingLost = false;
				debugLog("已确认媒体消息映射", {
					peerKey: this.lastConfirmedMediaTarget.peerKey,
					messageKey: this.lastConfirmedMediaTarget.messageKey,
					albumIndex: this.lastConfirmedMediaTarget.albumIndex
				});
				return true;
			}
			if (this.lastConfirmedMediaTarget?.mediaFingerprint !== currentFingerprint) this.currentMappingLost = true;
			return false;
		}
		createCloseSnapshot() {
			const sequenceId = runtime.closeSequenceId + 1;
			runtime.closeSequenceId = sequenceId;
			if (this.currentMappingLost) return {
				sequenceId,
				target: void 0,
				reason: "unmapped-current-media",
				capturedAt: Date.now()
			};
			const target = cloneMediaTarget(this.lastConfirmedMediaTarget);
			return {
				sequenceId,
				target: target?.confidence === "high" ? target : void 0,
				reason: target ? "" : "no-confirmed-target",
				capturedAt: Date.now()
			};
		}
		getLastConfirmedMediaTarget() {
			return this.lastConfirmedMediaTarget;
		}
		destroy() {
			this.clearPendingNavigation();
		}
	};
	//#endregion
	//#region tampermonkey/src/web-k/core/cleanup.js
	function addEventListenerCleanup(cleanupList, target, type, listener, options) {
		target.addEventListener(type, listener, options);
		cleanupList.push(() => target.removeEventListener(type, listener, options));
	}
	function runCleanupList(cleanupList) {
		for (const cleanup of cleanupList.splice(0)) cleanup();
	}
	function clearTimeoutId(timerId) {
		if (timerId) window.clearTimeout(timerId);
		return 0;
	}
	function clearIntervalId(timerId) {
		if (timerId) window.clearInterval(timerId);
		return 0;
	}
	function disconnectObserver(observer) {
		observer?.disconnect();
	}
	//#endregion
	//#region tampermonkey/src/web-k/core/settings.js
	var STORAGE_KEY = "tt.mediaContinuity.v1";
	var PHOTO_DURATION_INPUT_PATTERN = /^(\d+)(?:\.(\d))?$/;
	var DURATIONS = Object.freeze([
		2e3,
		3e3,
		5e3,
		8e3,
		1e4,
		15e3,
		3e4
	]);
	var BROWSE_DIRECTIONS = Object.freeze(["forward", "backward"]);
	var MEDIA_FILTERS = Object.freeze([
		"all",
		"images",
		"videos"
	]);
	var DEFAULT_SETTINGS = Object.freeze({
		continuousEnabled: false,
		photoDurationMs: 5e3,
		browseDirection: "forward",
		mediaFilter: "all",
		panelCollapsed: false
	});
	function isPlainObject(value) {
		return Boolean(value && typeof value === "object" && !Array.isArray(value));
	}
	function isValidPhotoDurationMs(value) {
		return Number.isInteger(value) && value >= 1e3 && value <= 3e5 && value % 100 === 0;
	}
	function isPresetPhotoDurationMs(value) {
		return DURATIONS.includes(value);
	}
	function parsePhotoDurationSeconds(value) {
		const normalizedValue = typeof value === "string" ? value.trim() : "";
		const match = PHOTO_DURATION_INPUT_PATTERN.exec(normalizedValue);
		if (!match) return void 0;
		const wholeSeconds = Number(match[1]);
		const tenths = match[2] ? Number(match[2]) : 0;
		if (!Number.isSafeInteger(wholeSeconds)) return void 0;
		const durationMs = wholeSeconds * 1e3 + tenths * 100;
		return isValidPhotoDurationMs(durationMs) ? durationMs : void 0;
	}
	function formatPhotoDurationMs(value) {
		if (!isValidPhotoDurationMs(value)) return "";
		const wholeSeconds = Math.floor(value / 1e3);
		const tenths = value % 1e3 / 100;
		return tenths ? `${wholeSeconds}.${tenths}` : String(wholeSeconds);
	}
	function validateSettings(value) {
		const source = isPlainObject(value) ? value : {};
		return {
			continuousEnabled: typeof source.continuousEnabled === "boolean" ? source.continuousEnabled : DEFAULT_SETTINGS.continuousEnabled,
			photoDurationMs: isValidPhotoDurationMs(source.photoDurationMs) ? source.photoDurationMs : DEFAULT_SETTINGS.photoDurationMs,
			browseDirection: BROWSE_DIRECTIONS.includes(source.browseDirection) ? source.browseDirection : DEFAULT_SETTINGS.browseDirection,
			mediaFilter: MEDIA_FILTERS.includes(source.mediaFilter) ? source.mediaFilter : DEFAULT_SETTINGS.mediaFilter,
			panelCollapsed: typeof source.panelCollapsed === "boolean" ? source.panelCollapsed : DEFAULT_SETTINGS.panelCollapsed
		};
	}
	function loadSettings() {
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			if (!raw) return { ...DEFAULT_SETTINGS };
			const parsed = JSON.parse(raw);
			if (isPlainObject(parsed) && isPlainObject(parsed.settings)) return validateSettings(parsed.settings);
			return validateSettings(parsed);
		} catch (error) {
			debugLog("读取本地设置失败", error);
			return { ...DEFAULT_SETTINGS };
		}
	}
	function saveSettings(settings) {
		const validatedSettings = validateSettings(settings);
		try {
			const raw = localStorage.getItem(STORAGE_KEY);
			let nextState = {};
			if (raw) try {
				const parsed = JSON.parse(raw);
				if (isPlainObject(parsed)) nextState = parsed;
			} catch (error) {
				debugLog("修复损坏的本地设置", error);
			}
			nextState.settings = validatedSettings;
			localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
			return nextState.settings;
		} catch (error) {
			debugLog("写入本地设置失败", error);
			return validatedSettings;
		}
	}
	function updateSettings(current, patch) {
		return saveSettings({
			...current,
			...patch
		});
	}
	//#endregion
	//#region tampermonkey/src/web-k/platform/navigation.js
	var PREVIOUS_SELECTOR = ".media-viewer-switcher-left";
	var NEXT_SELECTOR = ".media-viewer-switcher-right";
	var NAVIGATION_SELECTOR = `${PREVIOUS_SELECTOR}, ${NEXT_SELECTOR}`;
	function getNavigationButton(viewer, direction) {
		const selector = direction > 0 ? NEXT_SELECTOR : PREVIOUS_SELECTOR;
		const button = viewer.querySelector(selector);
		if (!isElementVisible(button)) return void 0;
		if (button.classList.contains("hide")) return void 0;
		return button;
	}
	function navigationAvailability(viewer) {
		return {
			previous: Boolean(getNavigationButton(viewer, -1)),
			next: Boolean(getNavigationButton(viewer, 1))
		};
	}
	function dispatchNavigation(viewer, direction) {
		const button = getNavigationButton(viewer, direction);
		if (!button) return false;
		debugLog("触发 Web K 官方方向控件", {
			direction,
			button: describeElement(button)
		});
		button.click();
		return true;
	}
	function getNavigationDirectionFromTarget(viewer, target) {
		if (!(target instanceof Element)) return 0;
		const button = target.closest(NAVIGATION_SELECTOR);
		if (!button || !viewer.contains(button)) return 0;
		return button.matches(NEXT_SELECTOR) ? 1 : -1;
	}
	//#endregion
	//#region tampermonkey/src/web-k/features/continuous-browsing/viewer-session.js
	var NAVIGATION_TIMEOUT_MS = 3e3;
	var INTERACTION_COOLDOWN_MS = 900;
	var REFRESH_DELAY_MS = 80;
	var NAVIGATION_POLL_MS = 100;
	var COUNTDOWN_REFRESH_MS = 200;
	var FILTER_SKIP_DELAY_MS = 80;
	var FILTER_SEQUENCE_MAX_SKIPS = 50;
	var FILTER_SEQUENCE_TIMEOUT_MS = 15e3;
	var EDITABLE_TARGET_SELECTOR$1 = [
		"input",
		"textarea",
		"select",
		"[contenteditable]:not([contenteditable=\"false\"])",
		"[role=\"textbox\"]"
	].join(", ");
	var MEDIA_TYPE_LABELS = Object.freeze({
		images: "图片",
		videos: "视频"
	});
	var ViewerSession = class {
		constructor(viewer, { controlPanelHostId, createControlPanel }) {
			this.viewer = viewer;
			this.settings = loadSettings();
			this.active = this.settings.continuousEnabled;
			this.paused = false;
			this.hovered = false;
			this.interacting = false;
			this.isNavigating = false;
			this.isZoomed = isMediaZoomed(viewer);
			this.destroyed = false;
			this.currentMedia = void 0;
			this.currentFingerprint = "none";
			this.mediaCleanup = [];
			this.timerId = 0;
			this.countdownId = 0;
			this.refreshTimer = 0;
			this.interactionTimer = 0;
			this.navigationPollTimer = 0;
			this.navigationAttemptId = 0;
			this.filterSkipTimer = 0;
			this.filterSequenceId = 0;
			this.filterSequence = void 0;
			this.blockCurrentTargetConfirmation = false;
			this.targetTracker = new MediaTargetTracker({ getCurrentFingerprint: () => this.currentFingerprint });
			this.panel = createControlPanel({
				hostId: controlPanelHostId,
				onToggleContinuous: () => this.toggleContinuous(),
				onTogglePause: () => this.togglePause(),
				onNavigate: (direction, automatic) => this.navigate(direction, automatic),
				onSetPhotoDuration: (duration) => this.setPhotoDuration(duration),
				onSetBrowseDirection: (direction) => this.setBrowseDirection(direction),
				onSetMediaFilter: (filter) => this.setMediaFilter(filter),
				onSetPanelCollapsed: (collapsed) => this.setPanelCollapsed(collapsed)
			});
			this.observer = new MutationObserver(() => this.requestRefresh());
			this.observer.observe(viewer, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: [
					"class",
					"style",
					"src",
					"aria-hidden"
				]
			});
			this.handleVisibilityChange = () => this.scheduleForCurrentMedia(true);
			this.handleFocusChange = () => this.scheduleForCurrentMedia(true);
			this.handlePointerUp = () => {
				if (!this.interacting) return;
				window.clearTimeout(this.interactionTimer);
				this.interactionTimer = window.setTimeout(() => {
					this.interacting = false;
					this.scheduleForCurrentMedia(true);
				}, INTERACTION_COOLDOWN_MS);
			};
			document.addEventListener("visibilitychange", this.handleVisibilityChange);
			window.addEventListener("focus", this.handleFocusChange);
			window.addEventListener("blur", this.handleFocusChange);
			window.addEventListener("pointerup", this.handlePointerUp, true);
			window.addEventListener("pointercancel", this.handlePointerUp, true);
			this.handleViewerPointerDown = (event) => {
				const direction = getNavigationDirectionFromTarget(this.viewer, event.target);
				if (!direction) return;
				this.takeOverFilterSequence();
				this.prepareNavigationTarget(direction);
			};
			this.handleViewerKeyDown = (event) => {
				if (event.repeat || !isElementVisible(this.viewer) || isEditableEventTarget$1(event)) return;
				if (event.key === "ArrowRight") {
					this.takeOverFilterSequence();
					this.prepareNavigationTarget(1);
				} else if (event.key === "ArrowLeft") {
					this.takeOverFilterSequence();
					this.prepareNavigationTarget(-1);
				}
			};
			this.viewer.addEventListener("pointerdown", this.handleViewerPointerDown, true);
			window.addEventListener("keydown", this.handleViewerKeyDown, true);
			this.refresh();
			debugLog("Web K 媒体查看器会话开始", describeElement(viewer));
		}
		viewState() {
			const availability = navigationAvailability(this.viewer);
			return {
				active: this.active,
				paused: this.paused,
				collapsed: this.settings.panelCollapsed,
				photoDurationMs: this.settings.photoDurationMs,
				browseDirection: this.settings.browseDirection,
				mediaFilter: this.settings.mediaFilter,
				canPrevious: availability.previous,
				canNext: availability.next
			};
		}
		getAutomaticDirection() {
			return this.settings.browseDirection === "backward" ? -1 : 1;
		}
		requestRefresh() {
			if (this.destroyed || this.refreshTimer) return;
			this.refreshTimer = window.setTimeout(() => {
				this.refreshTimer = 0;
				this.refresh();
			}, REFRESH_DELAY_MS);
		}
		refresh() {
			if (this.destroyed || !this.viewer.isConnected) return;
			const media = findActiveMedia(this.viewer);
			const isZoomed = isMediaZoomed(this.viewer);
			const hasZoomChanged = isZoomed !== this.isZoomed;
			this.isZoomed = isZoomed;
			this.panel.render(this.viewState());
			if (!media) {
				this.panel.setStatus("等待媒体加载");
				return;
			}
			const nextFingerprint = mediaFingerprint(media);
			if (media !== this.currentMedia || nextFingerprint !== this.currentFingerprint) this.bindMedia(media, nextFingerprint);
			else if (hasZoomChanged) this.scheduleForCurrentMedia(true);
		}
		prepareNavigationTarget(direction) {
			return this.targetTracker.prepareNavigationTarget(direction);
		}
		clearPendingNavigation() {
			this.targetTracker.clearPendingNavigation();
		}
		confirmCurrentMediaTarget() {
			if (this.blockCurrentTargetConfirmation) return false;
			return this.targetTracker.confirmCurrentMediaTarget(this.currentMedia);
		}
		createCloseSnapshot() {
			return this.targetTracker.createCloseSnapshot();
		}
		getLastConfirmedMediaTarget() {
			return this.targetTracker.getLastConfirmedMediaTarget();
		}
		bindMedia(media, nextFingerprint) {
			this.clearTimer();
			this.releaseMediaListeners();
			this.completeNavigationAttempt();
			this.currentMedia = media;
			this.currentFingerprint = nextFingerprint;
			this.blockCurrentTargetConfirmation = false;
			const add = (target, type, listener, options) => {
				addEventListenerCleanup(this.mediaCleanup, target, type, listener, options);
			};
			add(media, "pointerenter", () => {
				this.hovered = true;
				this.clearTimer();
				this.panel.setStatus("鼠标悬停，倒计时暂停");
			});
			add(media, "pointerleave", () => {
				this.hovered = false;
				this.scheduleForCurrentMedia(true);
			});
			add(media, "pointerdown", () => {
				this.interacting = true;
				this.clearTimer();
			}, true);
			add(media, "wheel", () => {
				this.interacting = true;
				this.clearTimer();
				window.clearTimeout(this.interactionTimer);
				this.interactionTimer = window.setTimeout(() => {
					this.interacting = false;
					this.scheduleForCurrentMedia(true);
				}, INTERACTION_COOLDOWN_MS);
			}, { passive: true });
			if (media instanceof HTMLImageElement) {
				add(media, "load", () => {
					this.confirmCurrentMediaTarget();
					this.scheduleForCurrentMedia(true);
				}, { once: true });
				add(media, "error", () => this.handleMediaError("图片加载失败，请手动处理"), { once: true });
			} else if (media instanceof HTMLVideoElement) {
				const confirmVideo = () => this.confirmCurrentMediaTarget();
				add(media, "loadedmetadata", confirmVideo);
				add(media, "loadeddata", confirmVideo);
				add(media, "canplay", confirmVideo);
				add(media, "playing", confirmVideo);
				add(media, "ended", () => {
					if (this.active && !this.paused && !this.blockCurrentTargetConfirmation) this.navigate(this.getAutomaticDirection(), true);
				});
				add(media, "error", () => this.handleMediaError("视频播放失败，请手动处理"));
			}
			this.panel.render(this.viewState());
			if (this.handleFilterSequenceForCurrentMedia()) return;
			this.confirmCurrentMediaTarget();
			this.scheduleForCurrentMedia(true);
		}
		handleMediaError(message) {
			if (this.blockCurrentTargetConfirmation) return;
			this.clearTimer();
			this.clearPendingNavigation();
			this.panel.setStatus(message);
		}
		handleFilterSequenceForCurrentMedia() {
			const sequence = this.filterSequence;
			if (!this.isFilterSequenceCurrent(sequence)) return false;
			if (this.hasFilterSequenceTimedOut(sequence)) {
				this.blockCurrentTargetConfirmation = true;
				this.pauseFilterSequence("筛选跳过超过总时限，连续浏览已暂停");
				return true;
			}
			const mediaType = getMediaType(this.currentMedia);
			if (!mediaType) {
				this.blockCurrentTargetConfirmation = true;
				this.pauseFilterSequence("无法可靠判断媒体类型，连续浏览已暂停");
				return true;
			}
			if (mediaType === sequence.filter) {
				this.cancelFilterSequence();
				return false;
			}
			this.blockCurrentTargetConfirmation = true;
			sequence.skipped += 1;
			if (sequence.skipped >= FILTER_SEQUENCE_MAX_SKIPS) {
				this.pauseFilterSequence(`已连续跳过 ${FILTER_SEQUENCE_MAX_SKIPS} 项，连续浏览已暂停`);
				return true;
			}
			const typeLabel = MEDIA_TYPE_LABELS[mediaType] || "媒体";
			this.panel.setStatus(`正在跳过${typeLabel}（${sequence.skipped}/${FILTER_SEQUENCE_MAX_SKIPS}）`);
			this.filterSkipTimer = window.setTimeout(() => {
				this.filterSkipTimer = 0;
				this.continueFilterSequence(sequence);
			}, FILTER_SKIP_DELAY_MS);
			return true;
		}
		continueFilterSequence(sequence) {
			if (!this.isFilterSequenceCurrent(sequence)) return;
			if (this.hasFilterSequenceTimedOut(sequence)) {
				this.pauseFilterSequence("筛选跳过超过总时限，连续浏览已暂停");
				return;
			}
			this.navigateOnce(sequence.direction, true, sequence);
		}
		startFilterSequence(direction) {
			this.cancelFilterSequence();
			this.filterSequenceId += 1;
			this.filterSequence = {
				id: this.filterSequenceId,
				direction,
				filter: this.settings.mediaFilter,
				startedAt: Date.now(),
				skipped: 0
			};
			return this.filterSequence;
		}
		isFilterSequenceCurrent(sequence) {
			return Boolean(sequence && this.filterSequence === sequence && sequence.id === this.filterSequenceId && sequence.filter === this.settings.mediaFilter && sequence.direction === this.getAutomaticDirection() && this.active && !this.paused && !this.destroyed);
		}
		hasFilterSequenceTimedOut(sequence) {
			return Date.now() - sequence.startedAt >= FILTER_SEQUENCE_TIMEOUT_MS;
		}
		cancelFilterSequence() {
			this.filterSkipTimer = clearTimeoutId(this.filterSkipTimer);
			this.filterSequence = void 0;
		}
		takeOverFilterSequence() {
			if (!this.filterSequence && !this.blockCurrentTargetConfirmation) return;
			this.cancelFilterSequence();
			this.filterSequenceId += 1;
			this.blockCurrentTargetConfirmation = false;
			this.confirmCurrentMediaTarget();
		}
		pauseFilterSequence(message) {
			this.cancelFilterSequence();
			this.filterSequenceId += 1;
			this.paused = true;
			this.clearTimer();
			this.panel.render(this.viewState());
			this.panel.setStatus(message);
		}
		releaseMediaListeners() {
			runCleanupList(this.mediaCleanup);
		}
		clearTimer() {
			this.timerId = clearTimeoutId(this.timerId);
			this.countdownId = clearIntervalId(this.countdownId);
		}
		completeNavigationAttempt() {
			this.navigationPollTimer = clearTimeoutId(this.navigationPollTimer);
			this.navigationAttemptId += 1;
			this.isNavigating = false;
		}
		canRunPhotoTimer() {
			return this.active && !this.paused && this.currentMedia instanceof HTMLImageElement && this.currentMedia.complete && this.currentMedia.naturalWidth > 0 && !document.hidden && document.hasFocus() && !this.hovered && !this.interacting && !this.isZoomed;
		}
		scheduleForCurrentMedia(forceRestart = false) {
			if (this.destroyed || !this.currentMedia || this.blockCurrentTargetConfirmation) return;
			if (forceRestart) this.clearTimer();
			const automaticDirection = this.getAutomaticDirection();
			const automaticDirectionLabel = automaticDirection > 0 ? "下一项" : "上一项";
			if (this.currentMedia instanceof HTMLVideoElement) {
				this.clearTimer();
				if (!this.active) return this.panel.setStatus("连续浏览已关闭");
				if (this.paused) return this.panel.setStatus("连续浏览已暂停");
				if (this.currentMedia.loop) return this.panel.setStatus("循环视频需手动切换");
				if (this.currentMedia.paused && !this.currentMedia.ended) {
					const playPromise = this.currentMedia.play();
					if (playPromise && typeof playPromise.catch === "function") playPromise.catch(() => this.panel.setStatus("点击视频开始播放"));
				} else this.panel.setStatus(`视频结束后自动切换${automaticDirectionLabel}`);
				return;
			}
			if (!(this.currentMedia instanceof HTMLImageElement)) {
				this.clearTimer();
				return this.panel.setStatus("当前媒体类型暂不支持");
			}
			if (!this.currentMedia.complete || this.currentMedia.naturalWidth <= 0) return this.panel.setStatus("等待图片加载");
			if (!this.active) return this.panel.setStatus("连续浏览已关闭");
			if (this.paused) return this.panel.setStatus("连续浏览已暂停");
			if (document.hidden || !document.hasFocus()) return this.panel.setStatus("页面失焦，倒计时暂停");
			if (this.hovered || this.interacting || this.isZoomed) return this.panel.setStatus("正在查看图片，倒计时暂停");
			if (!this.canRunPhotoTimer() || this.timerId) return void 0;
			const duration = this.settings.photoDurationMs;
			const startedAt = Date.now();
			const updateCountdown = () => {
				const remaining = Math.max(0, duration - (Date.now() - startedAt));
				this.panel.setStatus(`图片 ${(remaining / 1e3).toFixed(1)} 秒后切换${automaticDirectionLabel}`);
			};
			updateCountdown();
			this.countdownId = window.setInterval(updateCountdown, COUNTDOWN_REFRESH_MS);
			this.timerId = window.setTimeout(() => {
				this.clearTimer();
				this.navigate(automaticDirection, true);
			}, duration);
		}
		toggleContinuous() {
			this.takeOverFilterSequence();
			this.active = !this.active;
			if (this.active) this.paused = false;
			this.settings = updateSettings(this.settings, { continuousEnabled: this.active });
			this.panel.render(this.viewState());
			this.scheduleForCurrentMedia(true);
		}
		togglePause() {
			if (!this.active) return;
			if (this.paused) {
				this.blockCurrentTargetConfirmation = false;
				this.confirmCurrentMediaTarget();
			} else this.takeOverFilterSequence();
			this.paused = !this.paused;
			this.panel.render(this.viewState());
			this.scheduleForCurrentMedia(true);
		}
		setPhotoDuration(duration) {
			if (!isValidPhotoDurationMs(duration)) return false;
			this.settings = updateSettings(this.settings, { photoDurationMs: duration });
			this.panel.render(this.viewState());
			if (this.currentMedia instanceof HTMLImageElement) this.scheduleForCurrentMedia(true);
			return true;
		}
		setBrowseDirection(direction) {
			this.takeOverFilterSequence();
			this.settings = updateSettings(this.settings, { browseDirection: direction });
			this.panel.render(this.viewState());
			this.scheduleForCurrentMedia(true);
		}
		setMediaFilter(filter) {
			this.takeOverFilterSequence();
			this.settings = updateSettings(this.settings, { mediaFilter: filter });
			this.panel.render(this.viewState());
			this.scheduleForCurrentMedia(true);
		}
		setPanelCollapsed(collapsed) {
			this.settings = updateSettings(this.settings, { panelCollapsed: collapsed });
			this.panel.render(this.viewState());
		}
		navigate(direction, automatic) {
			if (this.destroyed) return;
			if (automatic && (!this.active || this.paused)) return;
			if (!automatic) {
				this.takeOverFilterSequence();
				this.navigateOnce(direction, false);
				return;
			}
			if (this.settings.mediaFilter === "all") {
				this.cancelFilterSequence();
				this.navigateOnce(direction, true);
				return;
			}
			const sequence = this.startFilterSequence(direction);
			this.navigateOnce(direction, true, sequence);
		}
		navigateOnce(direction, automatic, filterSequence) {
			if (this.destroyed || this.isNavigating) return;
			if (automatic && (!this.active || this.paused)) return;
			if (filterSequence && !this.isFilterSequenceCurrent(filterSequence)) return;
			if (filterSequence && this.hasFilterSequenceTimedOut(filterSequence)) {
				this.pauseFilterSequence("筛选跳过超过总时限，连续浏览已暂停");
				return;
			}
			if (!getNavigationButton(this.viewer, direction)) {
				if (automatic) {
					const message = filterSequence ? direction > 0 ? "已到当前媒体末尾，未找到更多匹配媒体" : "已到当前媒体开头，未找到更多匹配媒体" : direction > 0 ? "已到当前媒体末尾" : "已到当前媒体开头";
					this.finish(message);
				} else this.panel.setStatus(direction > 0 ? "没有可用的下一项" : "没有可用的上一项");
				this.panel.render(this.viewState());
				return;
			}
			this.clearTimer();
			this.prepareNavigationTarget(direction);
			const before = this.currentFingerprint;
			this.isNavigating = true;
			this.panel.setStatus(direction > 0 ? "正在切换下一项" : "正在切换上一项");
			if (!dispatchNavigation(this.viewer, direction)) {
				this.clearPendingNavigation();
				this.isNavigating = false;
				if (filterSequence) this.pauseFilterSequence("官方切换控件未触发，连续浏览已暂停");
				else this.panel.setStatus("官方切换控件未触发");
				this.panel.render(this.viewState());
				return;
			}
			const attemptId = this.navigationAttemptId + 1;
			this.navigationAttemptId = attemptId;
			const startedAt = Date.now();
			const poll = () => {
				if (this.destroyed || attemptId !== this.navigationAttemptId) return;
				const media = findActiveMedia(this.viewer);
				const after = mediaFingerprint(media);
				if (media && after !== before) {
					this.bindMedia(media, after);
					return;
				}
				if (filterSequence && this.isFilterSequenceCurrent(filterSequence) && this.hasFilterSequenceTimedOut(filterSequence)) {
					this.clearPendingNavigation();
					this.completeNavigationAttempt();
					this.pauseFilterSequence("筛选跳过超过总时限，连续浏览已暂停");
					return;
				}
				if (Date.now() - startedAt >= NAVIGATION_TIMEOUT_MS) {
					this.clearPendingNavigation();
					this.completeNavigationAttempt();
					if (filterSequence) {
						if (this.isFilterSequenceCurrent(filterSequence)) this.pauseFilterSequence("媒体未变化，筛选已暂停");
					} else this.panel.setStatus("媒体未变化，请执行调试检查");
					this.panel.render(this.viewState());
					return;
				}
				this.navigationPollTimer = window.setTimeout(poll, NAVIGATION_POLL_MS);
			};
			this.navigationPollTimer = window.setTimeout(poll, NAVIGATION_POLL_MS);
		}
		finish(message) {
			this.cancelFilterSequence();
			this.filterSequenceId += 1;
			this.active = false;
			this.paused = false;
			this.settings = updateSettings(this.settings, { continuousEnabled: false });
			this.clearTimer();
			this.panel.render(this.viewState());
			this.panel.setStatus(message);
		}
		destroy() {
			if (this.destroyed) return;
			this.destroyed = true;
			this.clearTimer();
			this.cancelFilterSequence();
			this.completeNavigationAttempt();
			clearTimeoutId(this.refreshTimer);
			clearTimeoutId(this.interactionTimer);
			this.targetTracker.destroy();
			this.releaseMediaListeners();
			disconnectObserver(this.observer);
			document.removeEventListener("visibilitychange", this.handleVisibilityChange);
			window.removeEventListener("focus", this.handleFocusChange);
			window.removeEventListener("blur", this.handleFocusChange);
			window.removeEventListener("pointerup", this.handlePointerUp, true);
			window.removeEventListener("pointercancel", this.handlePointerUp, true);
			this.viewer.removeEventListener("pointerdown", this.handleViewerPointerDown, true);
			window.removeEventListener("keydown", this.handleViewerKeyDown, true);
			this.panel.destroy();
			debugLog("Web K 媒体查看器会话结束");
		}
	};
	function isEditableEventTarget$1(event) {
		return (typeof event.composedPath === "function" ? event.composedPath() : [event.target]).some((target) => target instanceof Element && target.matches(EDITABLE_TARGET_SELECTOR$1));
	}
	//#endregion
	//#region tampermonkey/src/web-k/features/continuous-browsing/index.js
	function createViewerSession(viewer, options) {
		return new ViewerSession(viewer, options);
	}
	//#endregion
	//#region tampermonkey/src/web-k/features/control-panel/control-panel.js
	var CUSTOM_DURATION_VALUE = "custom";
	var CUSTOM_DURATION_ERROR = "请输入 1～300 秒，最多一位小数";
	var BROWSE_DIRECTION_LABELS = Object.freeze({
		forward: "正向",
		backward: "反向"
	});
	var MEDIA_FILTER_LABELS = Object.freeze({
		all: "图片和视频",
		images: "仅图片",
		videos: "仅视频"
	});
	var ControlPanel = class {
		constructor({ hostId, onToggleContinuous, onTogglePause, onNavigate, onSetPhotoDuration, onSetBrowseDirection, onSetMediaFilter, onSetPanelCollapsed }) {
			this.isCustomDurationOpen = false;
			this.currentPhotoDurationMs = DURATIONS[0];
			this.host = document.createElement("div");
			this.host.id = hostId;
			this.host.style.cssText = "position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:2147483646;pointer-events:none;";
			this.shadow = this.host.attachShadow({ mode: "open" });
			this.shadow.innerHTML = `
      <style>
        :host { all: initial; }
        .panel, .launcher {
          box-sizing: border-box;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #fff;
          pointer-events: auto;
          user-select: none;
        }
        .panel {
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
          gap: 7px;
          max-width: min(94vw, 960px);
          min-height: 46px;
          padding: 7px 9px;
          border: 1px solid rgba(255,255,255,.18);
          border-radius: 15px;
          background: rgba(20,24,32,.9);
          box-shadow: 0 10px 32px rgba(0,0,0,.35);
          backdrop-filter: blur(14px);
        }
        button, select, input {
          box-sizing: border-box;
          min-height: 32px;
          border: 0;
          border-radius: 9px;
          background: rgba(255,255,255,.12);
          color: inherit;
          font: inherit;
        }
        button { padding: 0 11px; cursor: pointer; }
        button:hover { background: rgba(255,255,255,.2); }
        button:disabled { cursor: not-allowed; opacity: .42; }
        button.primary[data-active="true"] { background: #2aabee; }
        button[hidden], .panel[hidden], .launcher[hidden], .custom-duration[hidden] { display: none !important; }
        select { padding: 0 8px; }
        input {
          width: 68px;
          padding: 0 7px;
          outline: none;
          user-select: text;
        }
        input:focus { box-shadow: 0 0 0 2px rgba(42,171,238,.72); }
        input[aria-invalid="true"] { box-shadow: 0 0 0 2px rgba(255,92,92,.78); }
        option { color: #111; }
        .duration-group, .custom-duration {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-wrap: wrap;
        }
        .duration-unit { font-size: 12px; color: rgba(255,255,255,.82); }
        .status {
          min-width: 118px;
          max-width: 260px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          padding: 0 4px;
          color: rgba(255,255,255,.82);
          font-size: 13px;
        }
        .launcher {
          min-width: 50px;
          height: 38px;
          border: 1px solid rgba(255,255,255,.2);
          border-radius: 19px;
          background: rgba(20,24,32,.9);
          box-shadow: 0 8px 24px rgba(0,0,0,.3);
          cursor: pointer;
        }
        @media (max-width: 720px) {
          .panel { gap: 5px; padding: 6px; }
          button { padding: 0 8px; }
          select { padding: 0 6px; }
          .status { min-width: 72px; max-width: 120px; }
        }
        @media (max-width: 480px) {
          .panel {
            max-width: calc(100vw - 12px);
            gap: 4px;
            padding: 5px;
          }
          button, select, input {
            min-height: 30px;
            font-size: 12px;
          }
          .duration-group { justify-content: center; }
          .status {
            order: 2;
            flex: 1 0 100%;
            min-width: 0;
            max-width: calc(100vw - 32px);
            text-align: center;
          }
        }
      </style>
      <div class="panel" role="toolbar" aria-label="Telegram Web K 连续媒体浏览">
        <button id="toggle" class="primary" type="button">连续浏览</button>
        <button id="pause" type="button">暂停</button>
        <button id="previous" type="button" aria-label="上一项">←</button>
        <button id="next" type="button" aria-label="下一项">→</button>
        <select id="filter" aria-label="自动浏览媒体类型">
          ${MEDIA_FILTERS.map((value) => `<option value="${value}">${MEDIA_FILTER_LABELS[value]}</option>`).join("")}
        </select>
        <select id="direction" aria-label="自动浏览方向">
          ${BROWSE_DIRECTIONS.map((value) => `<option value="${value}">${BROWSE_DIRECTION_LABELS[value]}</option>`).join("")}
        </select>
        <div class="duration-group">
          <select id="duration" aria-label="图片停留时间">
            ${DURATIONS.map((value) => `<option value="${value}">${formatPhotoDurationMs(value)} 秒</option>`).join("")}
            <option id="custom-duration-option" value="${CUSTOM_DURATION_VALUE}">自定义…</option>
          </select>
          <div id="custom-duration" class="custom-duration" hidden>
            <input
              id="custom-duration-input"
              type="text"
              inputmode="decimal"
              autocomplete="off"
              aria-label="自定义图片停留秒数"
            >
            <span class="duration-unit" aria-hidden="true">秒</span>
            <button id="apply-duration" type="button">应用</button>
          </div>
        </div>
        <span id="status" class="status" aria-live="polite">已就绪</span>
        <button id="collapse" type="button" aria-label="收起控制条">×</button>
      </div>
      <button class="launcher" id="launcher" type="button" aria-label="展开控制条" hidden>TT</button>
    `;
			document.body.appendChild(this.host);
			this.panel = this.shadow.querySelector(".panel");
			this.launcher = this.shadow.querySelector("#launcher");
			this.toggle = this.shadow.querySelector("#toggle");
			this.pause = this.shadow.querySelector("#pause");
			this.previous = this.shadow.querySelector("#previous");
			this.next = this.shadow.querySelector("#next");
			this.status = this.shadow.querySelector("#status");
			this.filter = this.shadow.querySelector("#filter");
			this.direction = this.shadow.querySelector("#direction");
			this.duration = this.shadow.querySelector("#duration");
			this.customDuration = this.shadow.querySelector("#custom-duration");
			this.customDurationInput = this.shadow.querySelector("#custom-duration-input");
			this.customDurationOption = this.shadow.querySelector("#custom-duration-option");
			for (const type of [
				"pointerdown",
				"mousedown",
				"mouseup",
				"click",
				"dblclick"
			]) this.shadow.addEventListener(type, (event) => event.stopPropagation());
			this.toggle.addEventListener("click", onToggleContinuous);
			this.pause.addEventListener("click", onTogglePause);
			this.previous.addEventListener("click", () => onNavigate(-1, false));
			this.next.addEventListener("click", () => onNavigate(1, false));
			this.filter.addEventListener("change", () => onSetMediaFilter(this.filter.value));
			this.direction.addEventListener("change", () => onSetBrowseDirection(this.direction.value));
			this.duration.addEventListener("change", () => {
				if (this.duration.value === CUSTOM_DURATION_VALUE) {
					this.isCustomDurationOpen = true;
					this.renderCustomDuration();
					this.customDurationInput.focus();
					this.customDurationInput.select();
					return;
				}
				this.isCustomDurationOpen = false;
				this.renderCustomDuration();
				onSetPhotoDuration(Number(this.duration.value));
			});
			this.customDurationInput.addEventListener("input", () => {
				this.customDurationInput.removeAttribute("aria-invalid");
			});
			this.customDurationInput.addEventListener("keydown", (event) => {
				event.stopPropagation();
				if (event.key !== "Enter") return;
				event.preventDefault();
				this.applyCustomPhotoDuration(onSetPhotoDuration);
			});
			this.shadow.querySelector("#apply-duration").addEventListener("click", () => {
				this.applyCustomPhotoDuration(onSetPhotoDuration);
			});
			this.shadow.querySelector("#collapse").addEventListener("click", () => onSetPanelCollapsed(true));
			this.launcher.addEventListener("click", () => onSetPanelCollapsed(false));
		}
		applyCustomPhotoDuration(onSetPhotoDuration) {
			const durationMs = parsePhotoDurationSeconds(this.customDurationInput.value);
			if (durationMs === void 0) {
				this.customDurationInput.setAttribute("aria-invalid", "true");
				this.setStatus(CUSTOM_DURATION_ERROR);
				return;
			}
			this.currentPhotoDurationMs = durationMs;
			this.isCustomDurationOpen = true;
			this.customDurationInput.removeAttribute("aria-invalid");
			this.customDurationInput.value = formatPhotoDurationMs(durationMs);
			this.customDurationOption.textContent = `自定义（${formatPhotoDurationMs(durationMs)} 秒）`;
			onSetPhotoDuration(durationMs);
		}
		renderCustomDuration() {
			this.customDuration.hidden = !this.isCustomDurationOpen;
			this.duration.value = this.isCustomDurationOpen ? CUSTOM_DURATION_VALUE : String(this.currentPhotoDurationMs);
		}
		render(state) {
			this.currentPhotoDurationMs = state.photoDurationMs;
			const isPresetDuration = isPresetPhotoDurationMs(state.photoDurationMs);
			if (!isPresetDuration) this.isCustomDurationOpen = true;
			const displayDuration = formatPhotoDurationMs(state.photoDurationMs);
			this.customDurationOption.textContent = isPresetDuration ? "自定义…" : `自定义（${displayDuration} 秒）`;
			if (this.shadow.activeElement !== this.customDurationInput) {
				this.customDurationInput.value = displayDuration;
				this.customDurationInput.removeAttribute("aria-invalid");
			}
			this.toggle.dataset.active = String(state.active);
			this.toggle.textContent = state.active ? "连续浏览：开" : "连续浏览：关";
			this.pause.textContent = state.paused ? "继续" : "暂停";
			this.pause.disabled = !state.active;
			this.previous.disabled = !state.canPrevious;
			this.next.disabled = !state.canNext;
			this.filter.value = state.mediaFilter;
			this.direction.value = state.browseDirection;
			this.renderCustomDuration();
			this.panel.hidden = state.collapsed;
			this.launcher.hidden = !state.collapsed;
		}
		setStatus(value) {
			this.status.textContent = value || "已就绪";
			this.status.title = value || "";
		}
		destroy() {
			this.host.remove();
		}
	};
	//#endregion
	//#region tampermonkey/src/web-k/features/control-panel/index.js
	function createControlPanel(options) {
		return new ControlPanel(options);
	}
	//#endregion
	//#region tampermonkey/src/web-k/version.js
	var WEB_K_VERSION = "0.4.0-k9";
	//#endregion
	//#region tampermonkey/src/web-k/features/debug/debug-api.js
	function describeLastConfirmedTarget() {
		const target = runtime.session?.getLastConfirmedMediaTarget();
		return target ? {
			peerKey: target.peerKey,
			messageKey: target.messageKey,
			albumIndex: target.albumIndex
		} : void 0;
	}
	function installDebugApi({ scheduleScan, scriptId, probes }) {
		const api = Object.freeze({
			inspect() {
				const viewer = findMediaViewer();
				const media = viewer && findActiveMedia(viewer);
				const result = {
					client: "web-k",
					viewer: describeElement(viewer),
					mediaRoot: describeElement(viewer && findMediaRoot(viewer)),
					activeMedia: describeElement(media),
					previousButton: describeElement(viewer && getNavigationButton(viewer, -1)),
					nextButton: describeElement(viewer && getNavigationButton(viewer, 1)),
					navigation: viewer ? navigationAvailability(viewer) : {
						previous: false,
						next: false
					},
					isZoomed: Boolean(viewer && isMediaZoomed(viewer)),
					hostMounted: Boolean(document.getElementById(scriptId)),
					sourceProbeCaptured: Boolean(runtime.lastSourceProbe),
					closeProbeStatus: runtime.closeProbe?.status || "idle",
					locationStatus: runtime.lastLocationResult?.status || "idle",
					lastConfirmedTarget: describeLastConfirmedTarget()
				};
				console.log("[Telegram Media Continuity] Web K DOM 探测结果", result);
				return result;
			},
			inspectMessageMapping: probes.inspectMessageMapping,
			armCloseFlowProbe: probes.armCloseFlowProbe,
			getCloseFlowProbe() {
				return runtime.closeProbe;
			},
			getLastLocationResult() {
				return runtime.lastLocationResult;
			},
			cancelCloseFlowProbe() {
				probes.clearCloseProbe();
				runtime.closeProbe = {
					status: "cancelled",
					finishedAt: Date.now()
				};
				return runtime.closeProbe;
			},
			enableDebug(enabled = true) {
				runtime.debugEnabled = Boolean(enabled);
				console.info(`[Telegram Media Continuity] 调试日志已${runtime.debugEnabled ? "开启" : "关闭"}`);
			},
			testPrevious() {
				const viewer = findMediaViewer();
				return Boolean(viewer && dispatchNavigation(viewer, -1));
			},
			testNext() {
				const viewer = findMediaViewer();
				return Boolean(viewer && dispatchNavigation(viewer, 1));
			},
			rescan() {
				scheduleScan();
			},
			getSummary() {
				const viewer = findMediaViewer();
				return {
					version: WEB_K_VERSION,
					client: "web-k",
					settings: loadSettings(),
					viewerDetected: Boolean(viewer),
					navigation: viewer ? navigationAvailability(viewer) : {
						previous: false,
						next: false
					},
					sourceProbeCaptured: Boolean(runtime.lastSourceProbe),
					closeProbeStatus: runtime.closeProbe?.status || "idle",
					locationStatus: runtime.lastLocationResult?.status || "idle",
					lastConfirmedTarget: describeLastConfirmedTarget()
				};
			}
		});
		Object.defineProperty(window, "TelegramMediaContinuity", {
			configurable: true,
			enumerable: false,
			writable: false,
			value: api
		});
	}
	//#endregion
	//#region tampermonkey/src/web-k/features/debug/probes.js
	var CLOSE_PROBE_TIMEOUT_MS = 6e3;
	var CLOSE_PROBE_POLL_MS = 50;
	function createDebugProbes({ scriptId }) {
		function collectScrollSnapshots(messageNodes) {
			const snapshots = [];
			const seen = /* @__PURE__ */ new Set();
			for (const messageNode of messageNodes) {
				if (!isElementVisible(messageNode)) continue;
				const container = findScrollableAncestor(messageNode);
				if (!container || seen.has(container)) continue;
				seen.add(container);
				snapshots.push({
					node: container,
					scrollTop: Math.round(container.scrollTop),
					scrollHeight: Math.round(container.scrollHeight),
					clientHeight: Math.round(container.clientHeight)
				});
				if (snapshots.length >= 8) break;
			}
			return snapshots;
		}
		function describeScrollSnapshots(snapshots) {
			return snapshots.map((snapshot, index) => ({
				index,
				element: describeElement(snapshot.node),
				scrollTop: snapshot.scrollTop,
				scrollHeight: snapshot.scrollHeight,
				clientHeight: snapshot.clientHeight
			}));
		}
		function collectChatProbe() {
			const messageNodes = collectMessageNodes();
			const visibleNodes = messageNodes.filter(isElementVisible);
			const sample = visibleNodes.slice(0, 12).map((element) => ({
				identity: getMessageIdentity(element),
				element: describeElement(element)
			}));
			const scrollSnapshots = collectScrollSnapshots(messageNodes);
			return {
				messageNodeCount: messageNodes.length,
				visibleMessageNodeCount: visibleNodes.length,
				messageNodesWithPeerId: messageNodes.filter((element) => getMessageIdentity(element)?.peerId).length,
				sample,
				scrollContainers: describeScrollSnapshots(scrollSnapshots)
			};
		}
		function collectMediaAncestors(viewer, media) {
			const result = [];
			let current = media;
			for (let depth = 0; current && depth < 12; depth += 1) {
				result.push(describeElement(current));
				if (current === viewer) break;
				current = current.parentElement;
			}
			return result.filter(Boolean);
		}
		function collectViewerControls(viewer) {
			if (!(viewer instanceof Element)) return [];
			const viewerRect = viewer.getBoundingClientRect();
			const controls = [];
			for (const element of viewer.querySelectorAll("button, a[href], [role=\"button\"], [tabindex]")) {
				if (!isElementVisible(element) || element.closest(`#${scriptId}`)) continue;
				const rect = element.getBoundingClientRect();
				let score = 0;
				if (rect.top < viewerRect.top + Math.min(180, viewerRect.height * .25)) score += 12;
				if (rect.left < viewerRect.left + 220 || rect.right > viewerRect.right - 220) score += 8;
				if (element instanceof HTMLAnchorElement) score += 4;
				const classText = Array.from(element.classList).join(" ").toLocaleLowerCase();
				if (/(close|back|author|date|message|viewer)/.test(classText)) score += 10;
				controls.push({
					element,
					score
				});
			}
			controls.sort((left, right) => right.score - left.score);
			return controls.slice(0, 24).map(({ element, score }, index) => ({
				index,
				score,
				element: describeControl(element)
			}));
		}
		function inspectMessageMapping() {
			const viewer = findMediaViewer();
			const media = viewer && findActiveMedia(viewer);
			const result = {
				client: "web-k",
				viewer: describeElement(viewer),
				activeMedia: describeElement(media),
				mediaAncestors: viewer && media ? collectMediaAncestors(viewer, media) : [],
				viewerControls: viewer ? collectViewerControls(viewer) : [],
				sourceClick: runtime.lastSourceProbe ? {
					...runtime.lastSourceProbe,
					ageMs: Date.now() - runtime.lastSourceProbe.capturedAt
				} : void 0,
				chat: collectChatProbe(),
				privacy: {
					includesTextContent: false,
					includesRawHref: false,
					includesMediaUrl: false,
					includesChannelName: false,
					includesUserName: false
				}
			};
			console.log("[Telegram Media Continuity] Web K 消息映射脱敏探测", result);
			return result;
		}
		function clearCloseProbe() {
			runtime.closeProbeTimer = clearTimeoutId(runtime.closeProbeTimer);
			runCleanupList(runtime.closeProbeCleanup);
			runtime.closeProbeInternal = void 0;
		}
		function compareScrollSnapshots(before, after) {
			const result = [];
			for (let index = 0; index < before.length; index += 1) {
				const beforeSnapshot = before[index];
				const afterSnapshot = after.find((snapshot) => snapshot.node === beforeSnapshot.node);
				result.push({
					index,
					stillConnected: beforeSnapshot.node.isConnected,
					beforeScrollTop: beforeSnapshot.scrollTop,
					afterScrollTop: afterSnapshot ? afterSnapshot.scrollTop : void 0,
					delta: afterSnapshot ? afterSnapshot.scrollTop - beforeSnapshot.scrollTop : void 0
				});
			}
			return result;
		}
		function finalizeCloseProbe(status, viewerClosedAt) {
			const internal = runtime.closeProbeInternal;
			if (!internal) return runtime.closeProbe;
			const messageNodes = collectMessageNodes();
			const afterScrolls = collectScrollSnapshots(messageNodes);
			const now = performance.now();
			runtime.closeProbe = {
				...runtime.closeProbe,
				status,
				finishedAt: Date.now(),
				elapsedMs: Math.round(now - internal.startedAt),
				closeElapsedFromIntentMs: internal.intentAt ? Math.round((viewerClosedAt || now) - internal.intentAt) : void 0,
				viewerConnectedAfter: internal.viewer.isConnected,
				viewerVisibleAfter: isElementVisible(internal.viewer),
				afterChat: {
					messageNodeCount: messageNodes.length,
					visibleMessageNodeCount: messageNodes.filter(isElementVisible).length,
					scrollContainers: describeScrollSnapshots(afterScrolls)
				},
				scrollChanges: compareScrollSnapshots(internal.beforeScrolls, afterScrolls)
			};
			clearCloseProbe();
			console.log("[Telegram Media Continuity] Web K 关闭流程脱敏探测", runtime.closeProbe);
			return runtime.closeProbe;
		}
		function armCloseFlowProbe() {
			clearCloseProbe();
			const viewer = findMediaViewer();
			if (!viewer) {
				runtime.closeProbe = {
					status: "no-visible-viewer",
					armedAt: Date.now()
				};
				console.warn("[Telegram Media Continuity] 未发现可见媒体查看器");
				return runtime.closeProbe;
			}
			const messageNodes = collectMessageNodes();
			const beforeScrolls = collectScrollSnapshots(messageNodes);
			const startedAt = performance.now();
			runtime.closeProbe = {
				status: "armed",
				armedAt: Date.now(),
				viewer: describeElement(viewer),
				candidateControls: collectViewerControls(viewer),
				beforeChat: {
					messageNodeCount: messageNodes.length,
					visibleMessageNodeCount: messageNodes.filter(isElementVisible).length,
					scrollContainers: describeScrollSnapshots(beforeScrolls)
				},
				intent: void 0
			};
			runtime.closeProbeInternal = {
				viewer,
				startedAt,
				intentAt: 0,
				beforeScrolls
			};
			const handleKeyDown = (event) => {
				if (event.key !== "Escape" || !runtime.closeProbeInternal) return;
				runtime.closeProbeInternal.intentAt = performance.now();
				runtime.closeProbe.intent = {
					type: "escape",
					elapsedMs: Math.round(runtime.closeProbeInternal.intentAt - startedAt),
					repeat: Boolean(event.repeat)
				};
			};
			const handlePointerDown = (event) => {
				if (!runtime.closeProbeInternal || !(event.target instanceof Element)) return;
				if (!viewer.contains(event.target)) return;
				runtime.closeProbeInternal.intentAt = performance.now();
				runtime.closeProbe.intent = {
					type: "viewer-pointer",
					elapsedMs: Math.round(runtime.closeProbeInternal.intentAt - startedAt),
					target: describeControl(event.target.closest("button, a[href], [role=\"button\"], [tabindex]") || event.target)
				};
			};
			window.addEventListener("keydown", handleKeyDown, true);
			window.addEventListener("pointerdown", handlePointerDown, true);
			runtime.closeProbeCleanup.push(() => window.removeEventListener("keydown", handleKeyDown, true), () => window.removeEventListener("pointerdown", handlePointerDown, true));
			const poll = () => {
				const internal = runtime.closeProbeInternal;
				if (!internal) return;
				const elapsed = performance.now() - internal.startedAt;
				if (!internal.viewer.isConnected) {
					const closedAt = performance.now();
					requestAnimationFrame(() => requestAnimationFrame(() => finalizeCloseProbe("viewer-removed", closedAt)));
					return;
				}
				if (!isElementVisible(internal.viewer)) {
					const closedAt = performance.now();
					requestAnimationFrame(() => requestAnimationFrame(() => finalizeCloseProbe("viewer-hidden", closedAt)));
					return;
				}
				if (elapsed >= CLOSE_PROBE_TIMEOUT_MS) {
					finalizeCloseProbe("timeout");
					return;
				}
				runtime.closeProbeTimer = window.setTimeout(poll, CLOSE_PROBE_POLL_MS);
			};
			runtime.closeProbeTimer = window.setTimeout(poll, CLOSE_PROBE_POLL_MS);
			console.info("[Telegram Media Continuity] 关闭流程探测已布防，请手动点击官方关闭按钮或按 Esc");
			return runtime.closeProbe;
		}
		return Object.freeze({
			armCloseFlowProbe,
			clearCloseProbe,
			inspectMessageMapping
		});
	}
	//#endregion
	//#region tampermonkey/src/web-k/features/debug/index.js
	function createDebugFeature({ scriptId }) {
		const probes = createDebugProbes({ scriptId });
		return Object.freeze({
			clearCloseProbe: probes.clearCloseProbe,
			installDebugApi(scheduleScan) {
				installDebugApi({
					scheduleScan,
					scriptId,
					probes
				});
			}
		});
	}
	//#endregion
	//#region tampermonkey/src/web-k/features/shortcuts/keyboard-shortcuts.js
	var EDITABLE_TARGET_SELECTOR = [
		"input",
		"textarea",
		"select",
		"[contenteditable]:not([contenteditable=\"false\"])",
		"[role=\"textbox\"]"
	].join(", ");
	var SHORTCUT_ACTIONS = Object.freeze({
		toggleContinuous: "toggle-continuous",
		togglePause: "toggle-pause"
	});
	function createKeyboardShortcuts({ viewer, isViewerVisible, onToggleContinuous, onTogglePause }) {
		let destroyed = false;
		function handleKeyDown(event) {
			if (destroyed || event.defaultPrevented || event.repeat || event.isComposing) return;
			if (event.ctrlKey || event.altKey || event.metaKey) return;
			if (!viewer.isConnected || !isViewerVisible()) return;
			if (isEditableEventTarget(event)) return;
			const action = getShortcutAction(event);
			if (!action) return;
			event.preventDefault();
			event.stopPropagation();
			if (action === SHORTCUT_ACTIONS.togglePause) onTogglePause();
			else onToggleContinuous();
		}
		window.addEventListener("keydown", handleKeyDown, true);
		return Object.freeze({ destroy() {
			if (destroyed) return;
			destroyed = true;
			window.removeEventListener("keydown", handleKeyDown, true);
		} });
	}
	function getShortcutAction(event) {
		if (event.code === "Space" || event.key === " " || event.key === "Spacebar") return SHORTCUT_ACTIONS.togglePause;
		if (event.code === "KeyA" || event.key.toLowerCase() === "a") return SHORTCUT_ACTIONS.toggleContinuous;
	}
	function isEditableEventTarget(event) {
		return (typeof event.composedPath === "function" ? event.composedPath() : [event.target]).some((target) => target instanceof Element && target.matches(EDITABLE_TARGET_SELECTOR));
	}
	//#endregion
	//#region tampermonkey/src/web-k/features/shortcuts/index.js
	function createShortcutSession(session, { isViewerVisible }) {
		let destroyed = false;
		const shortcuts = createKeyboardShortcuts({
			viewer: session.viewer,
			isViewerVisible,
			onToggleContinuous: () => session.toggleContinuous(),
			onTogglePause: () => session.togglePause()
		});
		return Object.freeze({
			viewer: session.viewer,
			requestRefresh: () => session.requestRefresh(),
			createCloseSnapshot: () => session.createCloseSnapshot(),
			getLastConfirmedMediaTarget: () => session.getLastConfirmedMediaTarget(),
			destroy() {
				if (destroyed) return;
				destroyed = true;
				shortcuts.destroy();
				session.destroy();
			}
		});
	}
	//#endregion
	//#region tampermonkey/src/web-k/app.js
	var CONTROL_PANEL_HOST_ID = "telegram-media-continuity-host";
	function createApp() {
		const debugFeature = createDebugFeature({ scriptId: CONTROL_PANEL_HOST_ID });
		const lifecycle = createLifecycle({
			captureSourceTarget: (event) => captureSourceProbe(event, CONTROL_PANEL_HOST_ID),
			clearCloseProbe: debugFeature.clearCloseProbe,
			clearLocationTimers,
			createSession: (viewer) => {
				return createShortcutSession(createViewerSession(viewer, {
					controlPanelHostId: CONTROL_PANEL_HOST_ID,
					createControlPanel
				}), { isViewerVisible: () => isElementVisible(viewer) });
			},
			findMediaViewer,
			installDebugApi: debugFeature.installDebugApi,
			isElementVisible,
			locateMessageAfterClose
		});
		return Object.freeze({
			start: lifecycle.initializeScript,
			scheduleScan: lifecycle.scheduleScan
		});
	}
	//#endregion
	//#region tampermonkey/src/web-k/entry.js
	createApp().start();
	//#endregion
})();
