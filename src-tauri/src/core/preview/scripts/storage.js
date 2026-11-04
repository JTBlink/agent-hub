(() => {
  const read = (storage) => {
    const result = {};
    let bytes = 0;
    if (storage.length > 2000)
      throw Error("Storage exceeds the inspection limit");
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index),
        value = storage.getItem(key);
      bytes += (key?.length || 0) + (value?.length || 0);
      if (bytes > 512 * 1024)
        throw Error("Storage exceeds the inspection limit");
      Object.defineProperty(result, key, { value, enumerable: true });
    }
    return result;
  };
  return { local: read(localStorage), session: read(sessionStorage) };
})();
