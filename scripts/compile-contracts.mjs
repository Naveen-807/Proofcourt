import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';

const rootDir = process.cwd();
const contractsDir = path.join(rootDir, 'contracts');
const artifactsDir = path.join(rootDir, 'artifacts', 'contracts');

const sources = Object.fromEntries(
  fs
    .readdirSync(contractsDir)
    .filter((file) => file.endsWith('.sol'))
    .map((file) => {
      const fullPath = path.join(contractsDir, file);
      return [`contracts/${file}`, { content: fs.readFileSync(fullPath, 'utf8') }];
    }),
);

const input = {
  language: 'Solidity',
  sources,
  settings: {
    viaIR: true,
    optimizer: {
      enabled: true,
      runs: 200,
    },
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode', 'metadata'],
      },
    },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = output.errors ?? [];
const fatalErrors = errors.filter((error) => error.severity === 'error');

for (const error of errors) {
  const prefix = error.severity === 'error' ? 'error' : 'warning';
  console.error(`[solc:${prefix}] ${error.formattedMessage}`);
}

if (fatalErrors.length > 0) {
  process.exit(1);
}

fs.mkdirSync(artifactsDir, { recursive: true });

const written = [];
for (const [sourceName, contracts] of Object.entries(output.contracts ?? {})) {
  for (const [contractName, artifact] of Object.entries(contracts)) {
    const artifactPath = path.join(artifactsDir, `${contractName}.json`);
    fs.writeFileSync(
      artifactPath,
      JSON.stringify(
        {
          contractName,
          sourceName,
          abi: artifact.abi,
          bytecode: artifact.evm.bytecode.object,
          deployedBytecode: artifact.evm.deployedBytecode.object,
          metadata: JSON.parse(artifact.metadata),
        },
        null,
        2,
      ),
    );
    written.push(path.relative(rootDir, artifactPath));
  }
}

console.log(`Compiled ${written.length} contract artifacts with solc ${solc.version()}`);
for (const artifactPath of written) {
  console.log(`- ${artifactPath}`);
}
