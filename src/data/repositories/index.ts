import { previewCache } from '../media/previewCache';
import { commentRepo } from './commentRepo';
import type { RepoContext } from './context';
import { kv } from './kv';
import { propertyRepo } from './propertyRepo';
import { vacationRepo } from './vacationRepo';
import { voteRepo } from './voteRepo';

export function createRepos(ctx: RepoContext) {
  return {
    vacations: vacationRepo(ctx),
    properties: propertyRepo(ctx),
    votes: voteRepo(ctx),
    comments: commentRepo(ctx),
    previews: previewCache(ctx.db, ctx.clock),
    kv: kv(ctx.db),
  };
}

export type Repos = ReturnType<typeof createRepos>;
