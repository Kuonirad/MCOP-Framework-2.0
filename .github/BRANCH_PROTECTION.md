# Branch Protection Configuration for GitHub

This document outlines the branch protection rules that should be configured for the `main` branch in the MCOP Framework 2.0 repository.

## Required Settings

### Rule Name: `main-branch-protection`
Apply to: `main` branch

### Protect matching branches ✅

#### ✅ Restrict pushes that create files larger than 100 MB

#### ✅ Require a pull request before merging
- **Required approvals**: 1
- **Dismiss stale PR approvals when new commits are pushed**: ✅
- **Require review from code owners**: ✅
- **Allow specific actors to bypass required pull requests**: ❌ (leave empty)

#### ✅ Require status checks to pass before merging
- **Require branches to be up to date before merging**: ✅
- **Status checks that are required**:
  - `test (18.x)`
  - `test (20.x)`
  - `security`
  - `build`

#### ✅ Require conversation resolution before merging

#### ✅ Require signed commits

#### ✅ Require linear history

#### ✅ Include administrators

## GitHub Web Interface Steps

1. Navigate to: https://github.com/Kuonirad/MCOP-Framework-2.0/settings/branches

2. Click the **"Add rule"** button

3. Configure the rule:
   - **Branch name pattern**: `main`
   - **Rule name**: `main-branch-protection`

4. Enable the following checkboxes:
   - ☑️ Restrict pushes that create files larger than 100 MB
   - ☑️ Require a pull request before merging
   - ☑️ Required approvals: `1`
   - ☑️ Dismiss stale PR approvals when new commits are pushed
   - ☑️ Require review from code owners
   - ☑️ Require status checks to pass before merging
   - ☑️ Require branches to be up to date before merging
   - ☑️ Require conversation resolution before merging
   - ☑️ Require signed commits
   - ☑️ Require linear history
   - ☑️ Include administrators

5. In the **Status checks that are required** section, search for and add:
   - `test (18.x)`
   - `test (20.x)`
   - `security`
   - `build`

6. Click **"Create"** to save the rule

## Expected CI Workflow Status Checks

Based on the `.github/workflows/ci.yml` file, the following status checks will be available:

1. **test (18.x)** - Tests running on Node.js 18
2. **test (20.x)** - Tests running on Node.js 20
3. **security** - Security audit and vulnerability checks
4. **build** - Application build verification

## Verification

After configuration, the branch protection should show:
- ✅ This branch is protected
- ✅ Pull request required
- ✅ Status checks required
- ✅ All configured rules active

## Troubleshooting

If status checks don't appear:
1. Ensure the CI workflow has run at least once
2. Check that the workflow file is in `.github/workflows/`
3. Verify the workflow is triggered on push to main
4. Check GitHub Actions settings are enabled

## Security Benefits

This configuration ensures:
- No direct pushes to main branch
- All changes reviewed by at least one person
- Automated testing passes before merge
- Code quality gates are enforced
- Security vulnerabilities are caught
- Linear commit history is maintained