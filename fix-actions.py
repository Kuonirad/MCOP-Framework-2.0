import os
import re

dir_path = '.github/workflows'

for filename in os.listdir(dir_path):
    if filename.endswith('.yml'):
        filepath = os.path.join(dir_path, filename)
        with open(filepath, 'r') as file:
            content = file.read()

        # Fix upload-artifact version from bad sha to v4
        content = re.sub(r'actions/upload-artifact@507695404364bd5b5d159487a4f94a83b603570c.*', 'actions/upload-artifact@v4', content)
        # Fix actions/checkout to v4
        content = re.sub(r'actions/checkout@8e8c483db84b4bee98b60c0593521ed34d9990e8.*', 'actions/checkout@v4', content)
        content = re.sub(r'actions/checkout@v6.*', 'actions/checkout@v4', content)
        # Fix actions/setup-node to v4
        content = re.sub(r'actions/setup-node@395ad3262231945c25e8478fd5baf05154b1d79f.*', 'actions/setup-node@v4', content)
        content = re.sub(r'actions/setup-node@v6.*', 'actions/setup-node@v4', content)
        # Fix codecov action to v5 (or standard)
        content = re.sub(r'codecov/codecov-action@671740ac38dd9b0130fbe1cec585b89eea48d3de.*', 'codecov/codecov-action@v5', content)
        # Fix redundant setup-project calls inside ci.yml that were probably spammed
        content = re.sub(r'(      - name: Setup project environment\n        uses: \./\.github/actions/setup-project\n){2,}', r'      - name: Setup project environment\n        uses: ./.github/actions/setup-project\n', content)
        # Publish workflow has duplicate checkout
        content = re.sub(r'(      - name: Checkout repository\n        uses: actions/checkout@v4\n)\s*uses: actions/checkout@v4', r'\1', content)

        # In a pnpm monorepo, npm commands should be pnpm (as per memory)
        content = content.replace('npm run lint', 'pnpm lint')
        content = content.replace('npm run build', 'pnpm build')
        content = content.replace('npm test', 'pnpm test')
        content = content.replace('npm audit', 'pnpm audit')
        content = content.replace('npm ci', 'pnpm install --frozen-lockfile')

        # Remove direct setup-node because setup-project composite should do it
        # Actually memory says "When refactoring GitHub Actions workflows to use a centralized composite action (e.g., .github/actions/setup-project) that securely manages Node.js and package manager setup, explicitly search for and remove any redundant actions/setup-node or pnpm/action-setup steps from individual jobs to prevent environment conflicts."
        content = re.sub(r'      - name: Setup Node\.js\n        uses: actions/setup-node@[^\n]+\n(?:        with:\n(?:          [^\n]+\n)+)?', '', content)
        content = re.sub(r'      - name: Checkout \(pinned\)\n        uses: actions/checkout@[^\n]+\n', '', content)

        # Node version 18 is deprecated, change it to 20
        content = content.replace('node-version: [18.x, 20.x]', 'node-version: [20.x, 22.x]')

        with open(filepath, 'w') as file:
            file.write(content)

# Fix setup-project action for pnpm
setup_action_path = '.github/actions/setup-project/action.yml'
with open(setup_action_path, 'r') as file:
    setup_content = file.read()

setup_content = setup_content.replace("cache: ${{ inputs.enable-cache == 'true' && 'npm' || '' }}", "cache: ${{ inputs.enable-cache == 'true' && 'pnpm' || '' }}")
setup_content = setup_content.replace('run: npm ci', 'run: pnpm install --frozen-lockfile')
setup_content = setup_content.replace("description: 'Enable npm dependency caching'", "description: 'Enable pnpm dependency caching'")
setup_content = setup_content.replace("description: 'Run npm ci to install dependencies'", "description: 'Run pnpm install to install dependencies'")

# We need pnpm action setup to happen BEFORE actions/setup-node if cache is pnpm!
pnpm_setup_str = """
    - name: Setup pnpm
      uses: pnpm/action-setup@v3
      with:
        version: 9

    - name: Setup Node.js"""

setup_content = setup_content.replace('    - name: Setup Node.js', pnpm_setup_str.lstrip('\n'))
setup_content = setup_content.replace('      uses: actions/setup-node@v4\n      with:\n        node-version: ${{ inputs.node-version }}', '      uses: actions/setup-node@v4\n      env:\n        FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true\n      with:\n        node-version: ${{ inputs.node-version }}')
setup_content = setup_content.replace('      uses: actions/checkout@v4', '      uses: actions/checkout@v4\n      env:\n        FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true')

with open(setup_action_path, 'w') as file:
    file.write(setup_content)

print("Fixed actions")
