const absoluteUrlPattern = /^(https?:)?\/\//i;

export const resolveBrandAsset = (path?: string): string => {
  if (!path || typeof path !== 'string') {
    return '';
  }

  if (absoluteUrlPattern.test(path)) {
    return path;
  }

  if (path.startsWith('/')) {
    return path;
  }

  return `/${path.replace(/^\.\//, '')}`;
};
