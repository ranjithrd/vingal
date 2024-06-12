const express = require("express")
const { google } = require("googleapis")
const fs = require("fs").promises
const dotenv = require("dotenv")

dotenv.config()
const app = express()

// var { Liquid } = require("liquidjs")
// var engine = new Liquid()

app.use(express.json())
// app.engine("liquid", engine.express())
// app.set("views", "./templates")
// app.set("view engine", "liquid")
app.use(express.static("public"))

const ID = "1A1CMkDPP_zI3Uqsnkb588lHbKjuZVe2OigauPbUd3uc"
const refreshValue = 1000 * 60 * 30

async function getSheetsClient() {
	const au = new google.auth.GoogleAuth({
		// keyFile: "credentials.json",
		credentials: {
			"type": "service_account",
			"project_id": "vingal",
			"private_key_id": "88af14b05736a3a9f2270f3ec030596e1b5d47c2",
			"private_key": process.env.private_key,
			"client_email": "vg-serviceaccount-njs-sheets@vingal.iam.gserviceaccount.com",
			"client_id": "102377590308794956347",
			"auth_uri": "https://accounts.google.com/o/oauth2/auth",
			"token_uri": "https://oauth2.googleapis.com/token",
			"auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
			"client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/vg-serviceaccount-njs-sheets%40vingal.iam.gserviceaccount.com"		  
		},
		scopes: ["https://www.googleapis.com/auth/spreadsheets"],
	})

	const client = await au.getClient()

	const sheets = google.sheets({
		version: "v4",
		auth: client,
	})

	return sheets
}

// Converts gSheets' default nested list to [object]
function processValues(x) {
	let d = []
	let key = {}

	x[0].forEach((e, i) => {
		key[i] = e
	})

	x.slice(1).forEach((e) => {
		el = {}
		e.forEach((r, i) => {
			el[key[i]] = r
		})
		d.push(el)
	})

	return d
}

async function getSheetData() {
	try {
		const sheets = await getSheetsClient()

		const sheetMDRes = await sheets.spreadsheets.values.get({
			spreadsheetId: ID,
			range: "Metadata",
		})

		const sheetMDRaw = sheetMDRes.data.values
		const sheetMD = processValues(sheetMDRaw)

		let data = {}

		// mType contains metadata for type mType.Type
		for (const mType of sheetMD) {
			let finalTypeData = []

			const tDataRaw = await sheets.spreadsheets.values.get({
				spreadsheetId: ID,
				range: mType.Type,
			})

			// tData contains actual data for type mType.Type
			const tData = processValues(tDataRaw.data.values)
			for (const tRow of tData) {
				finalTypeData.push({
					Type: mType.Type,
					Code: tRow[mType.Code],
					Title: tRow[mType.Title],
					Cat1: tRow[mType.Cat1],
					Cat2: mType.Cat2 ? tRow[mType.Cat2] : null,
					Cat3: mType.Cat3 ? tRow[mType.Cat3] : null,
				})
			}

			data[mType.Type] = finalTypeData
		}

		return data
	} catch (e) {
		return e
	}
}

let finalData = {}

async function getCache() {
	return JSON.parse(await fs.readFile("./cache.json"))
}

async function refreshData() {
	try {
		console.log("Refreshing data...")
		const d = await getSheetData()

		if (!d) throw new Error("No data found!")

		finalData = d

		await fs.writeFile(
			"./cache.json",
			JSON.stringify({
				lastRefreshed: Date.now(),
				data: d,
			})
		)

		console.log("Refreshed data, saved to cache")
	} catch (e) {
		console.error(e)
	}
}

// app.get("/", async (req, res) => {
// 	res.render("index.liquid")
// })

app.get("/json", (_, res) => {
	res.send(JSON.stringify(finalData, null, 2))
})

app.get("/pretty_json", (_, res) => {
	res.send(JSON.stringify(finalData, null, 2))
})

app.get("/r/index", async (_, res) => {
	let { lastRefreshed, data } = await getCache()

	const now = Date.now()
	console.log([
		"/r/index",
		lastRefreshed,
		now,
		now - refreshValue,
		lastRefreshed < now - refreshValue,
	])

	if (!data || lastRefreshed < now - refreshValue) {
		await refreshData()
	} else {
		finalData = data
	}

	let d = []

	for (const [k, v] of Object.entries(finalData)) {
		d.push({
			Type: k,
			Values: v.map((e) => [e.Code, e.Title, e.Cat1, e.Cat2, e.Cat3]),
		})
	}

	const pageData = {
		title: "Records",
	}

	res.send({ pageData: pageData, data: d })
})

app.get("/reload", async (req, res) => {
	await refreshData()
	res.redirect("/")
})

// app.get("/", (req, res) => {
// 	res.redirect("/records")
// })

async function main() {
	await refreshData()
	app.listen(process.env.PORT || 8301, () => {
		console.log("Server started on port", process.env.PORT || 8301)
	})
}

main()
