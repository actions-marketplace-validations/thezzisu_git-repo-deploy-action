import * as fs from 'fs-extra'
import { execute, execAsync, nativeExecAsync } from './exec'
import { getConfig } from './config'
import { info } from '@actions/core'

export async function main() {
  const config = getConfig()

  const local = '/tmp/git-repo-deploy'
  await fs.ensureDir('/tmp')

  try {
    const code = await execAsync('git', ['clone', `${config.repo}`, '-b', `${config.branch}`, '--depth', '1', `${local}`], '/tmp')
    if (code) {
      throw new Error(`git exited with code ${code}`)
    }
  } catch (e) {
    info(e.message)
    info(`Generating branch ${config.branch}`)
    if (await execute(`git clone ${config.repo} --depth 1 ${local}`, '/tmp')) {
      throw new Error('Bad repo')
    }
    await execute(`git checkout --orphan ${config.branch}`, local)
    await execute('git reset --hard', local)
  }

  await execute(`git config user.name "${config.name}"`, local)
  await execute(`git config user.email "${config.email}"`, local)

  info('Removing old files')
  await execute('git rm -r -f --ignore-unmatch "*"', local)
  info('Copying new files')
  await execute(`rsync -q -av --progress ${config.src} ${local}${config.dst}`, config.workspace)

  const { stdout } = await nativeExecAsync('git status --porcelain')
  if (!stdout.trim()) {
    // Nothing to commit
    info('Nothing to commit, exiting...')
    return
  }

  if (config.single) {
    info('Removing old commits')
    await execute(`git checkout --orphan ${config.branch}-temp`, local)
    await execute('git add --all .', local)
    await execute('git commit -m "deploy" --quiet', local)
    await execute(`git branch -M ${config.branch}-temp ${config.branch}`, local)
  } else {
    await execute('git add --all .', local)
    await execute('git commit -m "deploy" --quiet', local)
  }
  await execute(`git push origin ${config.branch} --force`, local)
}
