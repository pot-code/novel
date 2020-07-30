function empty_filter(line) {
  return !line || line.trim() === "";
}

module.exports = {
  empty_filter,
};
