// A Map kept in one JSON file under DATA_DIR. server.js holds its WebAuthn challenges and its
// pairing codes in Maps that live as long as the process; on a serverless deployment the
// /options and /verify halves of a sign-in, or the create and redeem of a pairing code, may run
// on two different instances, so the Map has to live where both can see it. Re-read whenever
// the file's text moved (another instance wrote it), written back on every change.
export class FileMap extends Map {
  constructor(fs, file) {
    super();
    this.fs = fs;
    this.file = file;
    this.text = undefined;
  }
  sync() {
    let text = null;
    try { text = this.fs.readFileSync(this.file, 'utf8'); } catch { /* none yet */ }
    if (text === this.text) return;
    this.text = text;
    super.clear();
    if (text) for (const [k, v] of JSON.parse(text)) super.set(k, v);
  }
  save() {
    this.text = JSON.stringify([...super.entries()]);
    this.fs.writeFileSync(this.file, this.text);
  }
  get(k) { this.sync(); return super.get(k); }
  has(k) { this.sync(); return super.has(k); }
  set(k, v) { this.sync(); super.set(k, v); this.save(); return this; }
  delete(k) { this.sync(); const had = super.delete(k); if (had) this.save(); return had; }
  get size() { this.sync(); return super.size; }
  keys() { this.sync(); return super.keys(); }
  values() { this.sync(); return super.values(); }
  entries() { this.sync(); return super.entries(); }
  [Symbol.iterator]() { return this.entries(); }
}
