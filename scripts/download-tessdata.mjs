import fs from 'node:fs'
import path from 'node:path'
import { Readable } from 'node:stream'
import { finished } from 'node:stream/promises'

const MODELS = [
  {
    name: 'chi_sim.traineddata.gz',
    url: 'https://fastly.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0_best/chi_sim.traineddata.gz'
  },
  {
    name: 'chi_tra.traineddata.gz',
    url: 'https://fastly.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0_best/chi_tra.traineddata.gz'
  },
  {
    name: 'eng.traineddata.gz',
    url: 'https://fastly.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0_best/eng.traineddata.gz'
  }
]

const TARGET_DIR = path.join(process.cwd(), 'resources', 'tessdata')

async function downloadFile(url, targetPath) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.statusText}`)
  const fileStream = fs.createWriteStream(targetPath)
  await finished(Readable.fromWeb(response.body).pipe(fileStream))
}

async function main() {
  console.log('🚀 Starting Tesseract models download...')

  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true })
    console.log(`Created directory: ${TARGET_DIR}`)
  }

  for (const model of MODELS) {
    const targetPath = path.join(TARGET_DIR, model.name)

    if (fs.existsSync(targetPath)) {
      console.log(`✅ ${model.name} already exists, skipping.`)
      continue
    }

    console.log(`📥 Downloading ${model.name}...`)
    try {
      await downloadFile(model.url, targetPath)
      console.log(`✨ Successfully downloaded ${model.name}`)
    } catch (error) {
      console.error(`❌ Failed to download ${model.name}:`, error.message)
    }
  }

  console.log('\n🎉 All tasks completed!')
}

main().catch((err) => {
  console.error('💥 Critical error:', err)
  process.exit(1)
})
