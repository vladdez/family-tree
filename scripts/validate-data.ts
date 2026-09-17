import { validateCatalog } from '../src/domain/validation';
import { readRawCatalog, validateMedia } from './data-files';
import { getTreeData } from '../src/domain/relationships';
import { getTreeBranches } from '../src/domain/tree-branches';
import branchRoots from '../src/data/tree-branches.json';
import treeSettings from '../src/data/tree-view.json';
import { getFocusedTree } from '../src/domain/focused-tree';
import { getPersonRedirects } from '../src/domain/person-redirects';
import personRedirects from '../src/data/person-redirects.json';
try {
  const catalog = validateCatalog(await readRawCatalog());
  const tree = getTreeData(catalog);
  getTreeBranches(tree.people, tree.relationships, branchRoots);
  getFocusedTree(catalog, treeSettings);
  getPersonRedirects(catalog, personRedirects);
  await validateMedia(catalog);
  console.log(`Данные проверены: ${catalog.people.length} людей, ${catalog.documents.length} документов, ${catalog.places.length} мест.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error); process.exitCode = 1;
}
