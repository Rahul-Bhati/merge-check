import { db } from "./db";

export async function rememberInstallation(input: {
  githubInstallationId: string;
  accountLogin: string;
  accountType: string;
  repositories: Array<{
    githubRepoId: string;
    owner: string;
    name: string;
    defaultBranch: string;
    cloneUrl: string | null;
  }>;
}): Promise<void> {
  const installation = await db().installation.upsert({
    where: { githubInstallationId: input.githubInstallationId },
    create: {
      githubInstallationId: input.githubInstallationId,
      accountLogin: input.accountLogin,
      accountType: input.accountType,
    },
    update: {
      accountLogin: input.accountLogin,
      accountType: input.accountType,
    },
  });

  for (const repo of input.repositories) {
    await db().repository.upsert({
      where: {
        installationId_owner_name: {
          installationId: installation.id,
          owner: repo.owner,
          name: repo.name,
        },
      },
      create: {
        installationId: installation.id,
        githubRepoId: repo.githubRepoId,
        owner: repo.owner,
        name: repo.name,
        defaultBranch: repo.defaultBranch,
        cloneUrl: repo.cloneUrl,
        enabled: false,
      },
      update: {
        githubRepoId: repo.githubRepoId,
        defaultBranch: repo.defaultBranch,
        cloneUrl: repo.cloneUrl,
      },
    });
  }
}
