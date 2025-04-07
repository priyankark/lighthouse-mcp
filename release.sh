#!/bin/bash

# release.sh - Script to help with releasing lighthouse-mcp to npm

# Exit on error
set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Starting release process for lighthouse-mcp...${NC}"

# Check if user is logged in to npm
echo -e "${YELLOW}Checking npm login status...${NC}"
NPM_USER=$(npm whoami 2>/dev/null || echo "")

if [ -z "$NPM_USER" ]; then
  echo -e "${RED}You are not logged in to npm. Please run 'npm login' first.${NC}"
  exit 1
else
  echo -e "${GREEN}Logged in as: $NPM_USER${NC}"
fi

# Check for uncommitted changes
if [ -d .git ]; then
  echo -e "${YELLOW}Checking for uncommitted changes...${NC}"
  if ! git diff-index --quiet HEAD --; then
    echo -e "${RED}You have uncommitted changes. Please commit or stash them before releasing.${NC}"
    exit 1
  else
    echo -e "${GREEN}No uncommitted changes found.${NC}"
  fi
fi

# Ask for version increment type
echo -e "${YELLOW}What kind of version bump would you like to make?${NC}"
echo "1) patch (0.1.0 -> 0.1.1) - Bug fixes"
echo "2) minor (0.1.0 -> 0.2.0) - New features, backwards compatible"
echo "3) major (0.1.0 -> 1.0.0) - Breaking changes"
echo "4) custom (Enter version manually)"

read -p "Enter your choice (1-4): " VERSION_CHOICE

case $VERSION_CHOICE in
  1)
    VERSION_TYPE="patch"
    ;;
  2)
    VERSION_TYPE="minor"
    ;;
  3)
    VERSION_TYPE="major"
    ;;
  4)
    read -p "Enter the new version (e.g., 1.2.3): " CUSTOM_VERSION
    VERSION_TYPE="$CUSTOM_VERSION"
    ;;
  *)
    echo -e "${RED}Invalid choice. Exiting.${NC}"
    exit 1
    ;;
esac

# Build the project
echo -e "${YELLOW}Building the project...${NC}"
npm run build

# Run tests if they exist
if grep -q "\"test\":" package.json; then
  echo -e "${YELLOW}Running tests...${NC}"
  npm test
else
  echo -e "${YELLOW}No tests found. Skipping test step.${NC}"
fi

# Update version
echo -e "${YELLOW}Updating version...${NC}"
if [ "$VERSION_CHOICE" -eq 4 ]; then
  npm version "$VERSION_TYPE" --no-git-tag-version
else
  npm version "$VERSION_TYPE" --no-git-tag-version
fi

NEW_VERSION=$(node -e "console.log(require('./package.json').version)")
echo -e "${GREEN}Version updated to $NEW_VERSION${NC}"

# Create a package to verify contents
echo -e "${YELLOW}Creating package to verify contents...${NC}"
npm pack

# Ask for confirmation before publishing
echo -e "${YELLOW}Package contents:${NC}"
tar -tf "lighthouse-mcp-$NEW_VERSION.tgz" | sort

read -p "Do you want to publish this package to npm? (y/n): " PUBLISH_CONFIRM

if [ "$PUBLISH_CONFIRM" != "y" ] && [ "$PUBLISH_CONFIRM" != "Y" ]; then
  echo -e "${RED}Publishing cancelled.${NC}"
  exit 1
fi

# Publish to npm
echo -e "${YELLOW}Publishing to npm...${NC}"
npm publish

# Commit version bump if git repository exists
if [ -d .git ]; then
  echo -e "${YELLOW}Committing version bump...${NC}"
  git add package.json package-lock.json
  git commit -m "Bump version to $NEW_VERSION"
  git tag "v$NEW_VERSION"
  
  read -p "Do you want to push the changes to the remote repository? (y/n): " PUSH_CONFIRM
  
  if [ "$PUSH_CONFIRM" = "y" ] || [ "$PUSH_CONFIRM" = "Y" ]; then
    echo -e "${YELLOW}Pushing changes to remote...${NC}"
    git push
    git push --tags
    echo -e "${GREEN}Changes pushed to remote.${NC}"
  else
    echo -e "${YELLOW}Changes not pushed to remote.${NC}"
  fi
fi

# Clean up
echo -e "${YELLOW}Cleaning up...${NC}"
rm "lighthouse-mcp-$NEW_VERSION.tgz"

echo -e "${GREEN}Release process completed successfully!${NC}"
echo -e "${GREEN}Version $NEW_VERSION of lighthouse-mcp has been published to npm.${NC}"
echo -e "${GREEN}Users can now run: npx lighthouse-mcp${NC}"
