let textDecoder
function encodeUtf8(str) {
  return new TextEncoder().encode(str)
}
function decodeUtf8(bytes) {
  if (!textDecoder) textDecoder = new TextDecoder('utf-8')
  return textDecoder.decode(bytes)
}
function buildBMH(needle) {
  const m = needle.length
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) table[i] = m
  for (let i = 0; i < m - 1; i++) table[needle[i]] = m - 1 - i
  return table
}
function indexBMH(haystack, needle, table, i) {
  const n = haystack.length
  const m = needle.length
  while (i <= n - m) {
    let j = m - 1
    while (j >= 0 && haystack[i + j] === needle[j]) j--
    if (j < 0) return i
    i += table[haystack[i + m - 1]]
  }
  return -1
}
const LOWER = new Uint8Array(256)
for (let i = 0; i < 256; i++) LOWER[i] = i >= 65 && i <= 90 ? i + 32 : i
function buildBMHAsciiCI(qLower) {
  const m = qLower.length
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) table[i] = m
  for (let i = 0; i < m - 1; i++) table[qLower[i]] = m - 1 - i
  return table
}
function indexBMHAsciiCI(haystack, qLower, table, i) {
  const n = haystack.length
  const m = qLower.length
  while (i <= n - m) {
    let j = m - 1
    while (j >= 0 && LOWER[haystack[i + j]] === qLower[j]) j--
    if (j < 0) return i
    i += table[LOWER[haystack[i + m - 1]]]
  }
  return -1
}
function emit(outObj, text, outChunk, labelPrefix, times) {
  if (text.indexOf('\uFFFD') !== -1) text = text.replace(/\uFFFD/g, '')
  const line = labelPrefix + text + '\n'
  times = Math.max(1, times | 0)
  for (let t = 0; t < times; t++) {
    outObj.out += line
    if (outObj.out.length >= outChunk) {
      self.postMessage({ type: 'chunk', text: outObj.out })
      outObj.out = ''
    }
  }
}
function scanUtf8(file, start, end, leftOverlap, rightOverlap, query, outChunk, everyOccurrence, labelPrefix, asciiCI) {
  return file.slice(start, end).arrayBuffer().then(buf => {
    const bytes = new Uint8Array(buf)
    const n = bytes.length
    const sliceStartAbs = start
    const outObj = { out: '' }
    let totalMatches = 0
    let lastSolAbs = -1
    function prevLF(pos) {
      for (let i = pos; i >= 0; i--) if (bytes[i] === 10) return i
      return -1
    }
    function nextLF(pos) {
      for (let i = pos; i < n; i++) if (bytes[i] === 10) return i
      return -1
    }
    let curSol = -1
    let curEol = -1
    let curSolAbs = -1
    let curTruncLeft = false
    let curTruncRight = false
    let curCount = 0
    function flushCurrent() {
      if (curCount > 0) {
        let line = decodeUtf8(bytes.subarray(curSol, curEol))
        if (curTruncLeft) line = '… ' + line
        if (curTruncRight) line = line + ' …'
        emit(outObj, line, outChunk, labelPrefix, curCount)
        totalMatches += curCount
        curCount = 0
        curSol = -1
        curEol = -1
        curSolAbs = -1
        curTruncLeft = false
        curTruncRight = false
      }
    }
    function onHit(posAbs) {
      if (posAbs < start || posAbs >= end) return
      const local = posAbs - sliceStartAbs
      const lfL = prevLF(local)
      const lfR = nextLF(local)
      let sol = lfL + 1
      let eol = lfR === -1 ? n : lfR
      let eolTrim = eol
      if (eolTrim > sol && bytes[eolTrim - 1] === 13) eolTrim = eolTrim - 1
      const solAbs = sol + sliceStartAbs
      const truncLeft = lfL === -1 && start > 0
      const truncRight = lfR === -1 && end < file.size
      if (everyOccurrence) {
        if (solAbs === curSolAbs && sol === curSol && eolTrim === curEol) {
          curCount++
        } else {
          flushCurrent()
          curSol = sol
          curEol = eolTrim
          curSolAbs = solAbs
          curTruncLeft = truncLeft
          curTruncRight = truncRight
          curCount = 1
        }
      } else {
        if (solAbs === lastSolAbs) return
        lastSolAbs = solAbs
        let line = decodeUtf8(bytes.subarray(sol, eolTrim))
        if (truncLeft) line = '… ' + line
        if (truncRight) line = line + ' …'
        emit(outObj, line, outChunk, labelPrefix, 1)
        totalMatches++
      }
    }
    const qBytes = encodeUtf8(query)
    const qLen = qBytes.length
    if (qLen === 0) {
      self.postMessage({ type: 'progress', bytes: end - start })
      self.postMessage({ type: 'done', count: 0 })
      return
    }
    if (asciiCI) {
      if (qLen === 1) {
        const cl = LOWER[qBytes[0]]
        for (let i = 0; i < n; i++) if (LOWER[bytes[i]] === cl) onHit(sliceStartAbs + i)
      } else {
        const qLower = new Uint8Array(qLen)
        for (let i = 0; i < qLen; i++) qLower[i] = LOWER[qBytes[i]]
        const table = buildBMHAsciiCI(qLower)
        for (let i = 0; ; ) {
          const pos = indexBMHAsciiCI(bytes, qLower, table, i)
          if (pos === -1) break
          onHit(sliceStartAbs + pos)
          i = pos + 1
        }
      }
    } else {
      if (qLen === 1) {
        const q0 = qBytes[0]
        for (let i = bytes.indexOf(q0, 0); i !== -1; i = bytes.indexOf(q0, i + 1)) onHit(sliceStartAbs + i)
      } else if (qLen <= 8) {
        for (let i = bytes.indexOf(qBytes[0], 0); i !== -1; i = bytes.indexOf(qBytes[0], i + 1)) {
          let ok = true
          for (let k = 1; k < qLen; k++) {
            if (bytes[i + k] !== qBytes[k]) {
              ok = false
              break
            }
          }
          if (ok) onHit(sliceStartAbs + i)
        }
      } else {
        const table = buildBMH(qBytes)
        for (let i = 0; ; ) {
          const pos = indexBMH(bytes, qBytes, table, i)
          if (pos === -1) break
          onHit(sliceStartAbs + pos)
          i = pos + 1
        }
      }
    }
    flushCurrent()
    if (outObj.out) self.postMessage({ type: 'chunk', text: outObj.out })
    self.postMessage({ type: 'progress', bytes: end - start })
    self.postMessage({ type: 'done', count: totalMatches })
  }).catch(err => self.postMessage({ type: 'error', error: String((err && err.message) || err) }))
}
function sanitizeLine(s) {
  return s.indexOf('\uFFFD') === -1 ? s : s.replace(/\uFFFD/g, '')
}
async function scanGeneric(file, enc, skip, query, outChunk, ci, everyOccurrence, labelPrefix) {
  const sliced = skip ? file.slice(skip) : file
  const stream = sliced.stream().pipeThrough(new TextDecoderStream(enc))
  const reader = stream.getReader()
  const Q = ci ? query.toLocaleLowerCase() : query
  let carry = ''
  let out = ''
  let count = 0
  function pushLine(line, times) {
    line = sanitizeLine(line.endsWith('\r') ? line.slice(0, -1) : line)
    times = Math.max(1, times | 0)
    const prefixed = labelPrefix + line + '\n'
    for (let t = 0; t < times; t++) {
      out += prefixed
      count++
      if (out.length >= outChunk) {
        self.postMessage({ type: 'chunk', text: out })
        out = ''
      }
    }
  }
  for (;;) {
    const r = await reader.read()
    if (r.done) break
    let block = carry + (r.value || '')
    const safeEnd = block.lastIndexOf('\n')
    if (safeEnd === -1) {
      carry = block
      continue
    }
    const searchBlock = ci ? block.toLocaleLowerCase() : block
    let from = 0
    while (true) {
      const pos = searchBlock.indexOf(Q, from)
      if (pos === -1 || pos > safeEnd) break
      const st = block.lastIndexOf('\n', pos) + 1
      let en = block.indexOf('\n', pos)
      if (en === -1 || en > safeEnd) en = safeEnd
      if (everyOccurrence) {
        const lineText = block.slice(st, en)
        const searchLine = ci ? lineText.toLocaleLowerCase() : lineText
        let lf = 0
        let localCount = 0
        for (;;) {
          const lp = searchLine.indexOf(Q, lf)
          if (lp === -1) break
          localCount++
          lf = lp + 1
        }
        if (localCount > 0) pushLine(lineText, localCount)
        from = en + 1
      } else {
        pushLine(block.slice(st, en), 1)
        from = en + 1
      }
    }
    carry = block.slice(safeEnd + 1)
  }
  if (carry) {
    const searchCarry = ci ? carry.toLocaleLowerCase() : carry
    if (searchCarry.indexOf(Q) !== -1) {
      if (everyOccurrence) {
        let lf = 0
        let localCount = 0
        for (;;) {
          const lp = searchCarry.indexOf(Q, lf)
          if (lp === -1) break
          localCount++
          lf = lp + 1
        }
        if (localCount > 0) pushLine(carry, localCount)
      } else {
        pushLine(carry, 1)
      }
    }
  }
  if (out) self.postMessage({ type: 'chunk', text: out })
  self.postMessage({ type: 'done', count })
}
self.onmessage = function (e) {
  const d = e.data || {}
  if (d.cmd === 'scan-utf8-fast') {
    scanUtf8(d.file, d.start, d.end, d.leftOverlap, d.rightOverlap, d.query, d.outChunk, d.everyOccurrence, d.labelPrefix, d.asciiCI)
  } else if (d.cmd === 'scan-generic') {
    scanGeneric(d.file, d.enc, d.skip, d.query, d.outChunk, d.ci, d.everyOccurrence, d.labelPrefix).catch(err =>
      self.postMessage({ type: 'error', error: String((err && err.message) || err) })
    )
  }
}
