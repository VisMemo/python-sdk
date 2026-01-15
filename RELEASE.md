# Releasing omem to PyPI

This guide walks you through releasing the `omem` package to PyPI.

## Prerequisites

1. **PyPI Account**: Create an account at [pypi.org](https://pypi.org/account/register/)
2. **TestPyPI Account** (recommended for testing): Create an account at [test.pypi.org](https://test.pypi.org/account/register/)
3. **Install build tools** (requires Python 3.8+):
   ```bash
   pip install --upgrade build twine setuptools wheel
   ```
   
   Note: `setuptools>=61.0` is required (specified in pyproject.toml)

## Quick Release Steps

### 1. Update Version

Before releasing, update the version in:
- `omem/__init__.py` - Update `__version__`
- `pyproject.toml` - Update `version` field

### 2. Prepare the Release

Make sure you're in the `python-sdk` directory:

```bash
cd python-sdk
```

### 3. Clean Previous Builds

```bash
rm -rf dist/ build/ *.egg-info
```

### 4. Build the Package

```bash
python -m build
```

This creates:
- `dist/omem-<version>-py3-none-any.whl` (wheel)
- `dist/omem-<version>.tar.gz` (source distribution)

### 5. Check the Package (Optional but Recommended)

```bash
# Check package contents
tar -tzf dist/omem-*.tar.gz

# Check for common issues
twine check dist/*
```

### 6. Test on TestPyPI (Recommended)

First time setup - you'll be prompted for credentials:
```bash
twine upload --repository testpypi dist/*
```

Then test the installation:
```bash
pip install --index-url https://test.pypi.org/simple/ omem
```

### 7. Upload to PyPI

When ready for production release:

```bash
twine upload dist/*
```

You'll be prompted for:
- **Username**: Your PyPI username (or use `__token__` for API tokens)
- **Password**: Your PyPI password or API token

### Using API Tokens (Recommended for CI/CD)

1. Go to [pypi.org/manage/account/token/](https://pypi.org/manage/account/token/)
2. Create a new API token
3. Use `__token__` as username and the token (starting with `pypi-`) as password

Example:
```bash
twine upload -u __token__ -p pypi-xxxxxxxxxxxxx dist/*
```

## Automated Release Script

You can use this script for easier releases:

```bash
#!/bin/bash
set -e

echo "Cleaning previous builds..."
rm -rf dist/ build/ *.egg-info

echo "Building package..."
python -m build

echo "Checking package..."
twine check dist/*

echo "Uploading to TestPyPI..."
read -p "Upload to TestPyPI? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    twine upload --repository testpypi dist/*
fi

read -p "Upload to PyPI? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    twine upload dist/*
fi

echo "Done!"
```

## Versioning Guidelines

Follow [Semantic Versioning](https://semver.org/):
- **MAJOR** (2.0.0): Breaking changes
- **MINOR** (2.1.0): New features, backward compatible
- **PATCH** (2.1.1): Bug fixes, backward compatible

## Verifying the Release

After uploading, verify the package is available:

```bash
pip index versions omem
```

Or visit: https://pypi.org/project/omem/

## Troubleshooting

### "Package already exists" error
- Check if the version already exists on PyPI
- Increment the version number

### Authentication errors
- Verify your credentials
- For API tokens, ensure you're using `__token__` as username
- Check token permissions (should have upload permissions)

### Build errors
- Ensure `setuptools` and `wheel` are up to date: `pip install --upgrade setuptools wheel`
- Check that all required files are included in the package

