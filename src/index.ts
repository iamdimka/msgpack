import { Int64BE } from "int64-buffer"

export default class MessagePack {
  buf: Buffer
  offset: number
  length: number

  constructor(buf: Buffer = Buffer.allocUnsafe(128)) {
    this.buf = buf
    this.offset = 0
    this.length = buf.byteLength
  }

  reset(buf?: Buffer) {
    this.offset = 0

    if (buf) {
      this.buf = buf
      this.length = buf.length
    }
  }

  buffer() {
    const buf = new Buffer(this.offset)
    this.buf.copy(buf, 0, 0, this.offset)
    return buf
  }

  end() {
    return this.buf.slice(0, this.offset)
  }

  protected _prepare(size: number): Buffer {
    if (this.offset + size <= this.length) {
      return this.buf
    }

    let l = this.length
    const required = this.offset + size
    while (l < required) {
      l *= 2
    }

    const old = this.buf
    this.buf = Buffer.allocUnsafe(l)
    old.copy(this.buf, 0, 0, this.offset)
    return this.buf
  }

  write(value: any) {
    switch (typeof value) {
      case "undefined":
        return this.writeNil()

      case "boolean":
        return this.writeBool(value)

      case "number":
        return this.writeNumber(value)

      case "string":
        return this.writeStr(value)

      case "object":
        if (value === null) return this.writeNil()
        if (Array.isArray(value)) return this.writeArray(value)
        if (value instanceof Buffer) return this.writeBin(value)
        if (value instanceof Map) return this.writeMap(value)
        return this.writeObject(value)
    }
  }

  writeNil() {
    this._prepare(1)[this.offset++] = 0xc0
  }

  writeBool(value: boolean) {
    this._prepare(1)[this.offset++] = value ? 0xc3 : 0xc2
  }

  writeInt(num: number) {
    if (num >= 0) {
      if (num <= 0x7f) {
        this._prepare(1)[this.offset++] = num
        return
      }

      if (num <= 0xff) {
        const buf = this._prepare(2)
        buf[this.offset++] = 0xcc
        buf[this.offset++] = num
        return
      }

      if (num <= 0xffff) {
        const buf = this._prepare(3)
        buf[this.offset] = 0xcd
        this.offset = buf.writeUInt16BE(num, this.offset + 1)
        return
      }

      if (num <= 0xffffffff) {
        const buf = this._prepare(5)
        buf[this.offset] = 0xce
        this.offset = buf.writeUInt32BE(num, this.offset + 1)
        return
      }

      const buf = this._prepare(9)
      buf[this.offset++] = 0xcf

      if (num < 0xffffffffffffffff) {
        this.offset = buf.writeUInt32BE(num / 0x100000000, this.offset)
        this.offset = buf.writeUInt32BE(num % 0x100000000, this.offset)
      } else {
        this.offset = buf.writeUInt32BE(0xffffffff, this.offset)
        this.offset = buf.writeUInt32BE(0xffffffff, this.offset)
      }
      return
    }

    if (num >= -0x20) {
      this.offset = this._prepare(1).writeInt8(num, this.offset)
      return
    }

    if (num >= -0x80) {
      const buf = this._prepare(2)
      buf[this.offset] = 0xd0
      this.offset = buf.writeInt8(num, this.offset + 1)
      return
    }

    if (num >= -0x8000) {
      const buf = this._prepare(3)
      buf[this.offset] = 0xd1
      this.offset = buf.writeInt16BE(num, this.offset + 1)
      return
    }

    if (num >= -0x80000000) {
      const buf = this._prepare(5)
      buf[this.offset] = 0xd2
      this.offset = buf.writeInt32BE(num, this.offset + 1)
      return
    }

    const buf = this._prepare(9)
    buf[this.offset] = 0xd3
    new Int64BE(buf, this.offset + 1, num)
    this.offset += 9
    // this.offset = buf.writeInt32BE(num / 0x80000000, this.offset + 1)
    // this.offset = buf.writeInt32BE(num % 0x80000000, this.offset)
  }

  writeFloat(num: number) {
    const buf = this._prepare(5)
    buf[this.offset] = 0xca
    this.offset = buf.writeFloatBE(num, this.offset + 1)
  }

  writeDouble(num: number) {
    const buf = this._prepare(9)
    buf[this.offset] = 0xcb
    this.offset = buf.writeDoubleBE(num, this.offset + 1)
  }

  writeNumber(num: number) {
    return Number.isInteger(num) ? this.writeInt(num) : this.writeFloat(num)
  }

  writeStr(str: string) {
    const strBuf = Buffer.from(str)
    const l = strBuf.byteLength

    let buf: Buffer

    if (l <= 0x1f) {
      buf = this._prepare(1 + l)
      buf[this.offset++] = 0xa0 + l
    } else if (l <= 0xff) {
      buf = this._prepare(2 + l)
      buf[this.offset++] = 0xd9
      buf[this.offset++] = l
    } else if (l <= 0xffff) {
      buf = this._prepare(3 + l)
      buf[this.offset] = 0xda
      this.offset = buf.writeUInt16BE(l, this.offset + 1)
    } else {
      buf = this._prepare(5 + l)
      buf[this.offset] = 0xdb
      this.offset = buf.writeUInt32BE(l, this.offset + 1)
    }

    strBuf.copy(buf, this.offset)
    this.offset += l
  }

  writeBin(bin: Buffer) {
    const l = bin.length
    let buf: Buffer

    if (l <= 0xff) {
      buf = this._prepare(2 + l)
      buf[this.offset++] = 0xc4
      buf[this.offset++] = l
    } else if (l <= 0xffff) {
      buf = this._prepare(3 + l)
      buf[this.offset] = 0xc5
      this.offset = buf.writeUInt16BE(l, this.offset + 1)
    } else {
      buf = this._prepare(5 + l)
      buf[this.offset] = 0xc6
      this.offset = buf.writeUInt32BE(l, this.offset + 1)
    }

    bin.copy(buf, this.offset)
    this.offset += l
  }

  writeArray(array: any[]) {
    const l = array.length

    if (l <= 0xf) {
      this._prepare(1)[this.offset++] = 0x90 + l
    } else if (l <= 0xffff) {
      const buf = this._prepare(3)
      buf[this.offset] = 0xdc
      this.offset = buf.writeUInt16BE(l, this.offset + 1)
    } else {
      const buf = this._prepare(5)
      buf[this.offset] = 0xdd
      this.offset = buf.writeUInt32BE(l, this.offset + 1)
    }

    for (let i = 0; i < l; i++) {
      this.write(array[i])
    }
  }

  writeMap(map: Map<any, any>) {
    const l = map.size

    if (l <= 0xf)
      this._prepare(1)[this.offset++] = 0x80 + l
    else if (l <= 0xffff) {
      const buf = this._prepare(3)
      buf[this.offset] = 0xde
      this.offset = buf.writeUInt16BE(l, this.offset + 1)
    } else {
      const buf = this._prepare(5)
      buf[this.offset] = 0xdf
      this.offset = buf.writeUInt32BE(l, this.offset + 1)
    }

    map.forEach((value, key) => {
      this.write(key)
      this.write(value)
    })
  }

  writeObject(object: { [key: string]: any }) {
    const keys = Object.keys(object)
    const l = keys.length

    if (l <= 0xf)
      this._prepare(1)[this.offset++] = 0x80 + l
    else if (l <= 0xffff) {
      const buf = this._prepare(3)
      buf[this.offset] = 0xde
      this.offset = buf.writeUInt16BE(l, this.offset + 1)
    } else {
      const buf = this._prepare(5)
      buf[this.offset] = 0xdf
      this.offset = buf.writeUInt32BE(l, this.offset + 1)
    }

    keys.forEach(key => {
      this.write(key)
      this.write(object[key])
    })
  }

  readUInt(size: number) {
    let value = 0

    switch (size) {
      case 1:
        value = this.buf.readUInt8(this.offset)
        break

      case 2:
        value = this.buf.readUInt16BE(this.offset)
        break

      case 4:
        value = this.buf.readUInt32BE(this.offset)
        break

      case 8:
        value = this.buf.readUInt32BE(this.offset) * 0x100000000
        value += this.buf.readUInt32BE(this.offset + 4)
        break

      default:
        throw new RangeError(`Invalid uint size: ${size}`)
    }

    this.offset += size
    return value
  }

  readInt(size: number) {
    let value = 0

    switch (size) {
      case 1:
        value = this.buf.readInt8(this.offset)
        break

      case 2:
        value = this.buf.readInt16BE(this.offset)
        break

      case 4:
        value = this.buf.readInt32BE(this.offset)
        break

      case 8:
        value = new Int64BE(this.buf, this.offset).toNumber()
        // value = this.buf.readInt32BE(this.offset) * 0x100000000
        // value += this.buf.readInt32BE(this.offset + 4)
        break

      default:
        throw new RangeError(`Invalid uint size: ${size}`)
    }

    this.offset += size
    return value
  }

  readBin(len: number): Buffer {
    const buf = Buffer.allocUnsafe(len)
    this.buf.copy(buf, 0, this.offset, this.offset + len)
    this.offset += len
    return buf
  }

  readStr(len: number) {
    const str = this.buf.toString("utf8", this.offset, this.offset + len)
    this.offset += len
    return str
  }

  readArray(len: number) {
    const res = new Array(len)

    for (let i = 0; i < len; i++)
      res[i] = this.read()

    return res
  }

  readMap(len: number) {
    const res = new Map()

    for (let i = 0; i < len; i++) {
      const key = this.read()
      res.set(key, this.read())
    }

    return res
  }

  readObject(len: number) {
    const res: { [key: string]: any } = {}

    for (let i = 0; i < len; i++) {
      const key = this.read()
      res[key] = this.read()
    }

    return res
  }

  read(): any {
    if (this.offset >= this.length) {
      throw new RangeError("Offset out of range")
    }

    const byte = this.buf[this.offset++]

    switch (byte) {
      case 0xc0: return null
      case 0xc2: return false
      case 0xc3: return true
      case 0xc4: return this.readBin(this.readUInt(1))
      case 0xc5: return this.readBin(this.readUInt(2))
      case 0xc6: return this.readBin(this.readUInt(4))
      case 0xca: {
        const value = this.buf.readFloatBE(this.offset)
        this.offset += 4
        return value
      }
      case 0xcb: {
        const value = this.buf.readDoubleBE(this.offset)
        this.offset += 8
        return value
      }
      case 0xcc: return this.buf.readUInt8(this.offset++)
      case 0xcd: return this.readUInt(2)
      case 0xce: return this.readUInt(4)
      case 0xcf: return this.readUInt(8)
      case 0xd0: return this.readInt(1)
      case 0xd1: return this.readInt(2)
      case 0xd2: return this.readInt(4)
      case 0xd3: return this.readInt(8)
      case 0xd9: return this.readStr(this.readUInt(1))
      case 0xda: return this.readStr(this.readUInt(2))
      case 0xdb: return this.readStr(this.readUInt(4))
      case 0xdc: return this.readArray(this.readUInt(2))
      case 0xdd: return this.readArray(this.readUInt(4))
      case 0xde: return this.readObject(this.readUInt(2))
      case 0xdf: return this.readObject(this.readUInt(4))

      default:
        if (byte >= 0 && byte <= 0x7f) return byte
        if (byte >= 0x80 && byte <= 0x8f) return this.readObject(byte - 0x80)
        if (byte >= 0x90 && byte <= 0x9f) return this.readArray(byte - 0x90)
        if (byte >= 0xa0 && byte <= 0xbf) return this.readStr(byte - 0xa0)
        if (byte >= 0xe0 && byte <= 0xff) return byte - 256;
        throw new TypeError(`Got invalid header byte ${byte}`)
    }
  }
}

export function encode(data: any): Buffer {
  const m = new MessagePack()
  m.write(data)
  return m.end()
}

export function decode(data: Buffer): any {
  return new MessagePack(data).read()
}

const v = {
  a: 1,
  b: true,
  x: -Date.now(),
  r: Date.now(),
  string: "Azaza",
  buf: Buffer.from([1, 2, 3])
}

const m = encode(v)

console.log(v)
console.log(m)
console.log(decode(m))