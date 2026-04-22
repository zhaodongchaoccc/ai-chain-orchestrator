const fs = require('fs')
const path = require('path')

const filePath = path.resolve(__dirname, '..', 'receipt-printing-flow.html')
const text = fs.readFileSync(filePath, 'utf8')

function mustInclude(value) {
  if (!text.includes(value)) {
    throw new Error(`Missing expected content: ${value}`)
  }
}

function mustNotInclude(value) {
  if (text.includes(value)) {
    throw new Error(`Unexpected stale content: ${value}`)
  }
}

mustInclude("id: 'G5'")
mustInclude("label: 'G5 · 返回下载链接'")
mustInclude("milestones: 5")
mustInclude("<div class=\"ms-code\">M5</div>")
mustInclude("<div class=\"ms-code\">收口</div>")
mustNotInclude("<div class=\"ms-code\">G5</div>")

console.log('receipt-printing-flow-check-ok')
