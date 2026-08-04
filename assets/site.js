const deploymentStates = new Set([
	"not-launched",
	"launch-gated",
	"launched",
	"paused",
])
const requiredHealthDisclaimer = "Not a live health check"
const publicText = /^[\x20-\x7e\u2019]+$/u

export const statusDataUrl = new URL(
	"../data/project-status.json",
	import.meta.url,
)

function objectWithExactKeys(value, keys) {
	if (
		typeof value !== "object" ||
		value === null ||
		Array.isArray(value) ||
		(Object.getPrototypeOf(value) !== Object.prototype &&
			Object.getPrototypeOf(value) !== null)
	) {
		return null
	}

	const actualKeys = Object.keys(value)
	return actualKeys.length === keys.length &&
		actualKeys.every((key) => keys.includes(key))
		? value
		: null
}

function safeText(value, maximumLength) {
	if (
		typeof value !== "string" ||
		value.trim() !== value ||
		value.length === 0 ||
		value.length > maximumLength ||
		!publicText.test(value) ||
		/[\\/]/u.test(value)
	) {
		return null
	}

	return value
}

function isValidIsoDate(value) {
	if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) {
		return false
	}

	const parsed = new Date(`${value}T00:00:00.000Z`)
	return (
		!Number.isNaN(parsed.valueOf()) &&
		parsed.toISOString().slice(0, 10) === value
	)
}

function formatEnglishDate(iso) {
	const [year, month, day] = iso.split("-").map(Number)
	const months = [
		"January",
		"February",
		"March",
		"April",
		"May",
		"June",
		"July",
		"August",
		"September",
		"October",
		"November",
		"December",
	]
	return `${months[month - 1]} ${day}, ${year}`
}

function parseDate(value) {
	const date = objectWithExactKeys(value, ["iso", "display"])
	if (
		!date ||
		!isValidIsoDate(date.iso) ||
		date.display !== formatEnglishDate(date.iso)
	) {
		return null
	}

	return { iso: date.iso, display: date.display }
}

function parseTextList(value, minimumItems, maximumItems, maximumTextLength) {
	if (
		!Array.isArray(value) ||
		value.length < minimumItems ||
		value.length > maximumItems
	) {
		return null
	}

	const entries = value.map((item) => safeText(item, maximumTextLength))
	return entries.some((item) => item === null) ? null : entries
}

function parseVerification(value) {
	if (!Array.isArray(value) || value.length < 1 || value.length > 8) {
		return null
	}

	const entries = value.map((entry) => {
		const check = objectWithExactKeys(entry, ["label", "passed", "total"])
		if (
			!check ||
			!safeText(check.label, 120) ||
			typeof check.passed !== "number" ||
			typeof check.total !== "number" ||
			!Number.isInteger(check.passed) ||
			!Number.isInteger(check.total) ||
			check.total < 1 ||
			check.passed !== check.total
		) {
			return null
		}

		return { label: check.label, passed: check.passed, total: check.total }
	})

	return entries.some((entry) => entry === null) ? null : entries
}

function parseUpdates(value) {
	if (!Array.isArray(value) || value.length > 12) {
		return null
	}

	const entries = value.map((entry) => {
		const update = objectWithExactKeys(entry, [
			"date",
			"title",
			"summary",
			"evidence",
		])
		if (!update) {
			return null
		}

		const date = parseDate(update.date)
		const evidence = parseTextList(update.evidence, 0, 8, 160)
		if (
			!date ||
			!safeText(update.title, 120) ||
			!safeText(update.summary, 360) ||
			!evidence
		) {
			return null
		}

		return { date, title: update.title, summary: update.summary, evidence }
	})

	if (entries.some((entry) => entry === null)) {
		return null
	}

	for (let index = 1; index < entries.length; index += 1) {
		if (entries[index - 1].date.iso < entries[index].date.iso) {
			return null
		}
	}

	return entries
}

export function normalizeStatus(value) {
	const status = objectWithExactKeys(value, [
		"schemaVersion",
		"project",
		"launchProgress",
		"deployment",
		"lastUpdated",
		"milestones",
		"verification",
		"updates",
	])
	if (!status || status.schemaVersion !== 1) {
		return null
	}

	const project = objectWithExactKeys(status.project, ["name", "tagline"])
	const launchProgress = objectWithExactKeys(status.launchProgress, [
		"percent",
		"stage",
		"label",
	])
	const deployment = objectWithExactKeys(status.deployment, [
		"state",
		"label",
		"note",
	])
	const milestones = objectWithExactKeys(status.milestones, [
		"completed",
		"current",
		"next",
		"gated",
	])
	if (!project || !launchProgress || !deployment || !milestones) {
		return null
	}

	const lastUpdated = parseDate(status.lastUpdated)
	const parsedMilestones = {
		completed: parseTextList(milestones.completed, 1, 8, 160),
		current: parseTextList(milestones.current, 1, 8, 160),
		next: parseTextList(milestones.next, 1, 8, 160),
		gated: parseTextList(milestones.gated, 1, 8, 160),
	}
	const verification = parseVerification(status.verification)
	const updates = parseUpdates(status.updates)

	if (
		!safeText(project.name, 80) ||
		!safeText(project.tagline, 180) ||
		typeof launchProgress.percent !== "number" ||
		!Number.isInteger(launchProgress.percent) ||
		launchProgress.percent < 0 ||
		launchProgress.percent > 100 ||
		!safeText(launchProgress.stage, 60) ||
		!safeText(launchProgress.label, 80) ||
		typeof deployment.state !== "string" ||
		!deploymentStates.has(deployment.state) ||
		!safeText(deployment.label, 80) ||
		!safeText(deployment.note, 180) ||
		!lastUpdated ||
		!parsedMilestones.completed ||
		!parsedMilestones.current ||
		!parsedMilestones.next ||
		!parsedMilestones.gated ||
		!verification ||
		!updates ||
		updates.some((update) => update.date.iso > lastUpdated.iso)
	) {
		return null
	}

	return {
		schemaVersion: 1,
		project: { name: project.name, tagline: project.tagline },
		launchProgress: {
			percent: launchProgress.percent,
			stage: launchProgress.stage,
			label: launchProgress.label,
		},
		deployment: {
			state: deployment.state,
			label: deployment.label,
			note: deployment.note,
		},
		lastUpdated,
		milestones: parsedMilestones,
		verification,
		updates,
	}
}

function find(document, selector) {
	return document.querySelector(selector)
}

function setText(document, selector, value) {
	const element = find(document, selector)
	if (element) {
		element.textContent = value
	}
}

function replaceTextList(document, selector, values) {
	const list = find(document, selector)
	if (!list) {
		return
	}

	const items = values.map((value) => {
		const item = document.createElement("li")
		item.textContent = value
		return item
	})
	list.replaceChildren(...items)
}

function renderUpdates(document, values) {
	const list = find(document, "[data-updates]")
	if (!list) {
		return
	}

	const items = values.map((update) => {
		const item = document.createElement("li")
		const time = document.createElement("time")
		time.setAttribute("datetime", update.date.iso)
		time.textContent = update.date.display
		const heading = document.createElement("h3")
		heading.textContent = update.title
		const summary = document.createElement("p")
		summary.textContent = update.summary
		const evidence = document.createElement("ul")

		for (const value of update.evidence) {
			const evidenceItem = document.createElement("li")
			evidenceItem.textContent = value
			evidence.append(evidenceItem)
		}

		item.append(time, heading, summary, evidence)
		return item
	})
	list.replaceChildren(...items)
}

function showFallback(document) {
	for (const element of document.querySelectorAll("[data-status-content]")) {
		element.hidden = true
	}
	const fallback = find(document, "[data-status-fallback]")
	if (fallback) {
		fallback.hidden = false
	}
}

export function renderProjectStatus(document, value) {
	const status = normalizeStatus(value)
	if (!status) {
		showFallback(document)
		return false
	}

	setText(document, "[data-project-name]", status.project.name)
	setText(document, "[data-project-tagline]", status.project.tagline)
	setText(document, "[data-progress-stage]", status.launchProgress.stage)
	setText(document, "[data-progress-label]", status.launchProgress.label)
	setText(document, "[data-deployment-label]", status.deployment.label)
	setText(document, "[data-deployment-note]", requiredHealthDisclaimer)
	setText(document, "[data-last-updated]", status.lastUpdated.display)

	const lastUpdated = find(document, "[data-last-updated]")
	if (lastUpdated) {
		lastUpdated.setAttribute("datetime", status.lastUpdated.iso)
	}

	const progress = find(document, "progress")
	if (progress) {
		progress.setAttribute("max", "100")
		progress.setAttribute("value", String(status.launchProgress.percent))
	}

	replaceTextList(
		document,
		"[data-verification]",
		status.verification.map(
			({ label, passed, total }) =>
				`${label}: ${passed} of ${total} checks passed`,
		),
	)
	for (const [group, values] of Object.entries(status.milestones)) {
		replaceTextList(document, `[data-milestones="${group}"]`, values)
	}
	renderUpdates(document, status.updates)

	for (const element of document.querySelectorAll("[data-status-content]")) {
		element.hidden = false
	}
	const fallback = find(document, "[data-status-fallback]")
	if (fallback) {
		fallback.hidden = true
	}

	return true
}

export function setOfflineState(document, offline) {
	const shell = find(document, "[data-status-shell]")
	if (shell) {
		shell.dataset.statusShell = offline ? "offline" : "online"
	}
	setText(
		document,
		"[data-offline-notice]",
		offline ? "You are offline. This curated status may be out of date." : "",
	)
}

function setStaleState(document) {
	const shell = find(document, "[data-status-shell]")
	if (shell) {
		shell.dataset.statusShell = "stale"
	}
	setText(
		document,
		"[data-offline-notice]",
		"This curated status may be out of date.",
	)
}

export function createStatusLoader(
	document,
	fetchImpl = fetch,
	connectivity = {},
) {
	let latestRequest = 0
	let hasLastGoodStatus = false
	const isOffline = connectivity.isOffline ?? (() => false)

	return {
		async load() {
			const request = ++latestRequest
			try {
				const response = await fetchImpl(statusDataUrl, {
					cache: "no-store",
					credentials: "omit",
				})
				if (!response.ok) {
					throw new Error("Status data is unavailable")
				}
				const status = normalizeStatus(await response.json())
				if (!status) {
					throw new Error("Status data is invalid")
				}
				if (request !== latestRequest) {
					return false
				}

				renderProjectStatus(document, status)
				hasLastGoodStatus = true
				setOfflineState(document, isOffline())
				return true
			} catch {
				if (request !== latestRequest) {
					return false
				}
				if (isOffline()) {
					setOfflineState(document, true)
				} else if (hasLastGoodStatus) {
					setStaleState(document)
				} else {
					showFallback(document)
				}
				return false
			}
		},
	}
}

export function loadProjectStatus(document, fetchImpl = fetch) {
	return createStatusLoader(document, fetchImpl).load()
}

export function startStatusSite(document, options = {}) {
	const fetchImpl = options.fetchImpl ?? fetch
	const eventTarget = options.eventTarget ?? window
	let offline =
		options.offline ??
		(typeof navigator !== "undefined" && navigator.onLine === false)
	const loader = createStatusLoader(document, fetchImpl, {
		isOffline: () => offline,
	})

	setOfflineState(document, offline)
	eventTarget.addEventListener("offline", () => {
		offline = true
		setOfflineState(document, true)
	})
	eventTarget.addEventListener("online", async () => {
		offline = false
		setOfflineState(document, false)
		await loader.load()
	})
	return loader.load()
}

if (typeof document !== "undefined" && typeof fetch === "function") {
	void startStatusSite(document)
}
