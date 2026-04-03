import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'
import { SkillManifestSchema, type SkillManifest } from './manifest'

/**
 * In-memory registry for skill manifests.
 * Discovers .skill.json files from local directories and remote HTTPS URLs.
 * Populated at startup, no hot-reload (D-10).
 */
export class SkillRegistry {
  private skills = new Map<string, SkillManifest>()

  /**
   * Scan a directory for *.skill.json files (recursive).
   * Returns silently if directory does not exist.
   */
  loadFromDirectory(dir: string = join(homedir(), '.gstackapp', 'skills')): void {
    const resolvedDir = resolve(dir)
    let entries: string[]
    try {
      entries = readdirSync(resolvedDir, { recursive: true }) as unknown as string[]
    } catch {
      return // Directory doesn't exist — not an error
    }

    for (const entry of entries) {
      if (!entry.endsWith('.skill.json')) continue
      const fullPath = join(resolvedDir, entry)
      try {
        const raw = JSON.parse(readFileSync(fullPath, 'utf-8'))
        const manifest = SkillManifestSchema.parse(raw)
        this.skills.set(manifest.id, manifest)
      } catch (err) {
        console.warn(`Skipping invalid skill manifest: ${fullPath}`, err)
      }
    }
  }

  /**
   * Fetch a manifest from a remote HTTPS URL.
   * @throws Error if URL is not HTTPS or response is not OK
   */
  async loadFromUrl(url: string): Promise<void> {
    if (!url.startsWith('https://')) {
      throw new Error('Remote skill URLs must use HTTPS')
    }
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to fetch skill: ${response.status}`)
    }
    const raw = await response.json()
    const manifest = SkillManifestSchema.parse(raw)
    this.skills.set(manifest.id, manifest)
  }

  /** Get a manifest by skill ID */
  get(id: string): SkillManifest | undefined {
    return this.skills.get(id)
  }

  /** List all loaded manifests */
  list(): SkillManifest[] {
    return Array.from(this.skills.values())
  }
}
