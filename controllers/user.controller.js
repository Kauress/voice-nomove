const UserModel = require("../models/User.Model");

exports.insertUser = async (user) => {
  //total number of users is position of next user
  const users = await UserModel.countDocuments({}).lean();
  await UserModel.create(user);
  return users;
};

exports.getUsers = async () => {
  return [
    ...(await UserModel.find({}).select("userId username active").lean()),
  ];
};

exports.getUserIndex = async (userId) => {
  const users = await this.getUsers();
  return {
    users,
    userIndex: users.findIndex((user) => user.userId === userId),
  };
};

exports.getUser = async (userId) => {
  const { users, userIndex } = await this.getUserIndex(userId);
  return {
    index: userIndex,
    ...(users[userIndex] || {}),
  };
};

exports.disableSpeech = async (userId) => {
  const user = await this.getUser(userId);
  await UserModel.updateOne({ userId }, { active: false });
  return user.index;
};

exports.assignSpeech = async (userIndex) => {
  const users = await this.getUsers();
  var user = users[userIndex];
  if (!user) {
    userIndex = 0;
    user = users[userIndex];
  }
  if (user) {
    await UserModel.updateOne({ userId: user.userId }, { active: true });
  }
  return {
    ...(user || {}),
    active: user ? true : false,
    index: userIndex,
  };
};

exports.getActiveUser = () => {
  return UserModel.findOne({ active: true }).select("_id userId").lean();
};

exports.removeUser = async (userId) => {
  const user = await this.getUser(userId);
  await UserModel.deleteOne({ userId });
  return user;
};
