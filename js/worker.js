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
    function isLineBreak(b) {
      return b === 10 || b === 13  // LF or CR
    }
    function prevLF(pos) {
      for (let i = pos; i >= 0; i--) if (isLineBreak(bytes[i])) return i
      return -1
    }
    function nextLF(pos) {
      for (let i = pos; i < n; i++) if (isLineBreak(bytes[i])) return i
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
function rarestOffset(bytes, qb) {
  const lim = Math.min(bytes.length, 262144)
  const hist = new Uint32Array(256)
  for (let i = 0; i < lim; i++) hist[bytes[i]]++
  let best = 0
  for (let k = 1; k < qb.length; k++) if (hist[qb[k]] < hist[qb[best]]) best = k
  return best
}
function makeFinder(bytes, qb, asciiCI) {
  const n = bytes.length
  const m = qb.length
  if (asciiCI) {
    if (m === 1) {
      const cl = LOWER[qb[0]]
      return function (i) {
        for (; i < n; i++) if (LOWER[bytes[i]] === cl) return i
        return -1
      }
    }
    const qLower = new Uint8Array(m)
    for (let i = 0; i < m; i++) qLower[i] = LOWER[qb[i]]
    const tableCI = buildBMHAsciiCI(qLower)
    return function (i) {
      return indexBMHAsciiCI(bytes, qLower, tableCI, i)
    }
  }
  if (m === 1) {
    const q0 = qb[0]
    return function (i) {
      return bytes.indexOf(q0, i)
    }
  }
  if (m <= 8) {
    const off = rarestOffset(bytes, qb)
    const anchor = qb[off]
    return function (i) {
      for (let p = bytes.indexOf(anchor, i + off); p !== -1; p = bytes.indexOf(anchor, p + 1)) {
        const s = p - off
        if (s + m > n) return -1
        let k = 0
        while (k < m && bytes[s + k] === qb[k]) k++
        if (k === m) return s
      }
      return -1
    }
  }
  const table = buildBMH(qb)
  return function (i) {
    return indexBMH(bytes, qb, table, i)
  }
}
function buildAC(qList, asciiCI) {
  const cls = new Uint16Array(256)
  let K = 1
  for (let k = 0; k < qList.length; k++) {
    const q = qList[k]
    for (let i = 0; i < q.length; i++) if (cls[q[i]] === 0) cls[q[i]] = K++
  }
  if (asciiCI) for (let b = 65; b <= 90; b++) cls[b] = cls[b + 32]
  const edges = new Map()
  const par = [-1]
  const via = [0]
  const term = []
  let states = 1
  for (let k = 0; k < qList.length; k++) {
    const q = qList[k]
    if (!q.length) continue
    let s = 0
    for (let i = 0; i < q.length; i++) {
      const c = cls[q[i]]
      const key = s * 512 + c
      let t = edges.get(key)
      if (t === undefined) {
        t = states++
        edges.set(key, t)
        par.push(s)
        via.push(c)
      }
      s = t
    }
    if (term[s]) term[s].push(k)
    else term[s] = [k]
  }
  const cStart = new Int32Array(states + 1)
  for (let t = 1; t < states; t++) cStart[par[t] + 1]++
  for (let s = 0; s < states; s++) cStart[s + 1] += cStart[s]
  const cCls = new Uint16Array(states)
  const cTo = new Int32Array(states)
  const fillPos = cStart.slice(0, states)
  for (let t = 1; t < states; t++) {
    const j = fillPos[par[t]]++
    cCls[j] = via[t]
    cTo[j] = t
  }
  const fail = new Int32Array(states)
  const order = new Int32Array(states)
  const outs = new Array(states)
  let head = 0
  let tail = 1
  while (head < tail) {
    const s = order[head++]
    for (let j = cStart[s], e = cStart[s + 1]; j < e; j++) {
      const c = cCls[j]
      const t = cTo[j]
      let f = 0
      if (s !== 0) {
        let g = fail[s]
        for (;;) {
          const x = edges.get(g * 512 + c)
          if (x !== undefined) {
            f = x
            break
          }
          if (g === 0) break
          g = fail[g]
        }
      }
      fail[t] = f
      const own = term[t]
      const inh = outs[f]
      outs[t] = own ? (inh ? own.concat(inh) : own) : inh
      order[tail++] = t
    }
  }
  let S = 1
  let shift = 0
  while (S < K) {
    S <<= 1
    shift++
  }
  if (states * S <= 4194304) {
    const newId = new Int32Array(states)
    let A = 0
    for (let i = 0; i < states; i++) if (!outs[order[i]]) newId[order[i]] = A++
    let id = A
    for (let i = 0; i < states; i++) if (outs[order[i]]) newId[order[i]] = id++
    const delta = new Int32Array(states * S)
    for (let i = 0; i < states; i++) {
      const s = order[i]
      const row = newId[s] * S
      if (s !== 0) {
        const frow = newId[fail[s]] * S
        delta.copyWithin(row, frow, frow + S)
      }
      for (let j = cStart[s], e = cStart[s + 1]; j < e; j++) delta[row + cCls[j]] = newId[cTo[j]] * S
    }
    const nAcc = states - A
    const lists = new Array(nAcc)
    for (let s = 0; s < states; s++) if (outs[s]) lists[newId[s] - A] = outs[s]
    const outStart = new Int32Array(nAcc + 1)
    let total = 0
    for (let a = 0; a < nAcc; a++) {
      outStart[a] = total
      total += lists[a].length
    }
    outStart[nAcc] = total
    const outList = new Int32Array(total)
    for (let a = 0; a < nAcc; a++) outList.set(lists[a], outStart[a])
    return { dense: true, cls, delta, shift, A, accBase: A * S, outStart, outList }
  }
  const acc = new Uint8Array(states)
  const outStart = new Int32Array(states + 1)
  let total = 0
  for (let s = 0; s < states; s++) {
    outStart[s] = total
    if (outs[s]) {
      acc[s] = 1
      total += outs[s].length
    }
  }
  outStart[states] = total
  const outList = new Int32Array(total)
  for (let s = 0; s < states; s++) if (outs[s]) outList.set(outs[s], outStart[s])
  const rootNext = new Int32Array(K)
  for (let j = cStart[0], e = cStart[1]; j < e; j++) rootNext[cCls[j]] = cTo[j]
  return { dense: false, cls, rootNext, cStart, cCls, cTo, fail, acc, outStart, outList }
}
let acKey = ''
let acVal = null
function getAC(queries, qList, asciiCI) {
  const key = (asciiCI ? '1' : '0') + JSON.stringify(queries)
  if (acVal === null || acKey !== key) {
    acVal = buildAC(qList, asciiCI)
    acKey = key
  }
  return acVal
}
function runDenseAC(bytes, n, ac, hit) {
  const delta = ac.delta
  const cls = ac.cls
  const accBase = ac.accBase
  let s = 0
  for (let i = 0; i < n; i++) {
    s = delta[s + cls[bytes[i]]]
    if (s >= accBase) hit(s, i)
  }
}
function runSparseAC(bytes, n, ac, hit) {
  const cls = ac.cls
  const rootNext = ac.rootNext
  const cStart = ac.cStart
  const cCls = ac.cCls
  const cTo = ac.cTo
  const fail = ac.fail
  const acc = ac.acc
  let s = 0
  for (let i = 0; i < n; i++) {
    const c = cls[bytes[i]]
    if (c === 0) {
      s = 0
      continue
    }
    for (;;) {
      if (s === 0) {
        s = rootNext[c]
        break
      }
      let t = -1
      for (let j = cStart[s], e = cStart[s + 1]; j < e; j++) {
        if (cCls[j] === c) {
          t = cTo[j]
          break
        }
      }
      if (t !== -1) {
        s = t
        break
      }
      s = fail[s]
    }
    if (acc[s] === 1) hit(s, i)
  }
}
function scanUtf8Multi(file, start, end, aligned, queries, outChunk, everyOccurrence, labelPrefix, asciiCI) {
  return file.slice(start, end).arrayBuffer().then(buf => {
    const bytes = new Uint8Array(buf)
    const n = bytes.length
    const qn = queries.length
    const qList = new Array(qn)
    const lens = new Int32Array(qn)
    for (let k = 0; k < qn; k++) {
      const qb = encodeUtf8(queries[k])
      if (asciiCI) for (let i = 0; i < qb.length; i++) qb[i] = LOWER[qb[i]]
      qList[k] = qb
      lens[k] = qb.length
    }
    const outs = new Array(qn).fill('')
    const counts = new Array(qn).fill(0)
    const lastEol = new Int32Array(qn)
    const pendCount = new Int32Array(qn)
    const pendLine = new Array(qn)
    const edgeLeft = start > 0 && !aligned
    const edgeRight = end < file.size
    let cSol = -1
    let cEol = -1
    let cText = ''
    function locate(pos) {
      let l = pos
      while (l >= 0) {
        const b = bytes[l]
        if (b === 10 || b === 13) break
        l--
      }
      let r = pos
      while (r < n) {
        const b = bytes[r]
        if (b === 10 || b === 13) break
        r++
      }
      let text = decodeUtf8(bytes.subarray(l + 1, r))
      if (l === -1 && edgeLeft) text = '… ' + text
      if (r === n && edgeRight) text = text + ' …'
      if (text.indexOf('\uFFFD') !== -1) text = text.replace(/\uFFFD/g, '')
      cSol = l + 1
      cEol = r
      cText = text
    }
    function put(k, text, times) {
      const line = labelPrefix + text + '\n'
      for (let t = 0; t < times; t++) {
        outs[k] += line
        if (outs[k].length >= outChunk) {
          self.postMessage({ type: 'chunk', q: k, text: outs[k] })
          outs[k] = ''
        }
      }
      counts[k] += times
    }
    function onMatch(k, pos) {
      if (pos < lastEol[k]) {
        if (everyOccurrence) pendCount[k]++
        return
      }
      if (pendCount[k] > 0) {
        put(k, pendLine[k], pendCount[k])
        pendCount[k] = 0
      }
      if (pos < cSol || pos >= cEol) locate(pos)
      lastEol[k] = cEol
      if (everyOccurrence) {
        pendLine[k] = cText
        pendCount[k] = 1
      } else {
        put(k, cText, 1)
      }
    }
    if (qn === 1) {
      if (lens[0] > 0) {
        const find = makeFinder(bytes, qList[0], asciiCI)
        let i = 0
        while (i < n) {
          const pos = find(i)
          if (pos === -1) break
          onMatch(0, pos)
          i = everyOccurrence ? pos + 1 : lastEol[0] + 1
        }
      }
    } else if (qn > 1) {
      const ac = getAC(queries, qList, asciiCI)
      const outStart = ac.outStart
      const outList = ac.outList
      if (ac.dense) {
        const shift = ac.shift
        const A = ac.A
        runDenseAC(bytes, n, ac, function (s, i) {
          const a = (s >> shift) - A
          for (let j = outStart[a], e = outStart[a + 1]; j < e; j++) {
            const k = outList[j]
            onMatch(k, i - lens[k] + 1)
          }
        })
      } else {
        runSparseAC(bytes, n, ac, function (s, i) {
          for (let j = outStart[s], e = outStart[s + 1]; j < e; j++) {
            const k = outList[j]
            onMatch(k, i - lens[k] + 1)
          }
        })
      }
    }
    if (everyOccurrence) {
      for (let k = 0; k < qn; k++) {
        if (pendCount[k] > 0) {
          put(k, pendLine[k], pendCount[k])
          pendCount[k] = 0
        }
      }
    }
    for (let k = 0; k < qn; k++) if (outs[k]) self.postMessage({ type: 'chunk', q: k, text: outs[k] })
    self.postMessage({ type: 'progress', bytes: end - start })
    self.postMessage({ type: 'done', counts })
  }).catch(err => self.postMessage({ type: 'error', error: String((err && err.message) || err) }))
}
async function scanGenericMulti(file, enc, skip, queries, outChunk, ci, everyOccurrence, labelPrefix) {
  const sliced = skip ? file.slice(skip) : file
  const stream = sliced.stream().pipeThrough(new TextDecoderStream(enc))
  const reader = stream.getReader()
  const qn = queries.length
  const Qs = new Array(qn)
  for (let k = 0; k < qn; k++) Qs[k] = ci ? queries[k].toLocaleLowerCase() : queries[k]
  const outs = new Array(qn).fill('')
  const counts = new Array(qn).fill(0)
  function pushLine(k, line, times) {
    line = sanitizeLine(line.endsWith('\r') ? line.slice(0, -1) : line)
    times = Math.max(1, times | 0)
    const prefixed = labelPrefix + line + '\n'
    for (let t = 0; t < times; t++) {
      outs[k] += prefixed
      counts[k]++
      if (outs[k].length >= outChunk) {
        self.postMessage({ type: 'chunk', q: k, text: outs[k] })
        outs[k] = ''
      }
    }
  }
  function countAll(s, Q) {
    let lf = 0
    let c = 0
    for (;;) {
      const lp = s.indexOf(Q, lf)
      if (lp === -1) break
      c++
      lf = lp + 1
    }
    return c
  }
  let carry = ''
  for (;;) {
    const r = await reader.read()
    if (r.done) break
    const block = carry + (r.value || '')
    const safeEnd = block.lastIndexOf('\n')
    if (safeEnd === -1) {
      carry = block
      continue
    }
    const searchBlock = ci ? block.toLocaleLowerCase() : block
    for (let k = 0; k < qn; k++) {
      const Q = Qs[k]
      let from = 0
      while (true) {
        const pos = searchBlock.indexOf(Q, from)
        if (pos === -1 || pos > safeEnd) break
        const st = block.lastIndexOf('\n', pos) + 1
        let en = block.indexOf('\n', pos)
        if (en === -1 || en > safeEnd) en = safeEnd
        if (everyOccurrence) {
          const lineText = block.slice(st, en)
          const c = countAll(ci ? lineText.toLocaleLowerCase() : lineText, Q)
          if (c > 0) pushLine(k, lineText, c)
        } else {
          pushLine(k, block.slice(st, en), 1)
        }
        from = en + 1
      }
    }
    carry = block.slice(safeEnd + 1)
  }
  if (carry) {
    const searchCarry = ci ? carry.toLocaleLowerCase() : carry
    for (let k = 0; k < qn; k++) {
      if (searchCarry.indexOf(Qs[k]) !== -1) {
        if (everyOccurrence) {
          const c = countAll(searchCarry, Qs[k])
          if (c > 0) pushLine(k, carry, c)
        } else {
          pushLine(k, carry, 1)
        }
      }
    }
  }
  for (let k = 0; k < qn; k++) if (outs[k]) self.postMessage({ type: 'chunk', q: k, text: outs[k] })
  self.postMessage({ type: 'done', counts })
}
self.onmessage = function (e) {
  const d = e.data || {}
  if (d.cmd === 'scan-utf8-fast') {
    scanUtf8(d.file, d.start, d.end, d.leftOverlap, d.rightOverlap, d.query, d.outChunk, d.everyOccurrence, d.labelPrefix, d.asciiCI)
  } else if (d.cmd === 'scan-generic') {
    scanGeneric(d.file, d.enc, d.skip, d.query, d.outChunk, d.ci, d.everyOccurrence, d.labelPrefix).catch(err =>
      self.postMessage({ type: 'error', error: String((err && err.message) || err) })
    )
  } else if (d.cmd === 'scan-utf8-multi') {
    scanUtf8Multi(d.file, d.start, d.end, d.aligned, d.queries, d.outChunk, d.everyOccurrence, d.labelPrefix, d.asciiCI)
  } else if (d.cmd === 'scan-generic-multi') {
    scanGenericMulti(d.file, d.enc, d.skip, d.queries, d.outChunk, d.ci, d.everyOccurrence, d.labelPrefix).catch(err =>
      self.postMessage({ type: 'error', error: String((err && err.message) || err) })
    )
  }
}
