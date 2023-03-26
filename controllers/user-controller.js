const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const validator = require('validator')

const helpers = require('../_helpers')

const { User, Tweet, Reply, Like, Followship } = require('../models')

const userController = {
  signIn: async (req, res, next) => {
    try {
      const userData = helpers.getUser(req).toJSON()
      delete userData.password
      const token = jwt.sign(userData, process.env.JWT_SECRET, {
        expiresIn: '30d'
      })
      return res.json({
        status: 'success',
        message: '登入成功!',
        data: {
          token,
          user: userData
        }
      })
    } catch (err) {
      next(err)
    }
  },
  signUp: async (req, res, next) => {
    try {
      const { account, name, email, password, checkPassword } = req.body
      const errors = []

      // check if all the required fields are filled out correctly
      if (!account || !name || !email || !password || !checkPassword) {
        errors.push('所有欄位皆必填')
      }
      if (name && !validator.isByteLength(name, { max: 50 })) {
        errors.push('字數超出上限，請將字數限制在 50 字以內')
      }
      if (password && !validator.isByteLength(password, { min: 8, max: 20 })) {
        errors.push('密碼長度介於 8 ~ 20 字元')
      }
      if (password !== checkPassword) {
        errors.push('密碼與確認密碼不相符')
      }
      if (email && !validator.isEmail(email)) {
        errors.push('請輸入有效的 email 格式')
      }

      // Check if account and email are unique
      const [userAccount, userEmail] = await Promise.all([
        User.findOne({ where: { account } }),
        User.findOne({ where: { email } })
      ])
      if (userAccount) errors.push('帳號已重複註冊！')
      if (userEmail) errors.push('Email已重複註冊！')

      // Return error message if there are errors
      if (errors.length) {
        return res.status(400).json({ status: 'error', errors })
      }

      // Hash password
      const salt = await bcrypt.genSalt(10)
      const hashedPassword = await bcrypt.hash(password, salt)

      // Create user in DB
      await User.create({
        account,
        name,
        email,
        password: hashedPassword
      })

      return res.status(200).json({ status: 'success', message: '註冊成功！' })
    } catch (err) {
      next(err)
    }
  },
  getUserTweets: async (req, res, next) => {
    try {
      const { userId } = req.params
      const currentUserId = helpers.getUser(req).id

      if (currentUserId !== Number(userId)) {
        return res.status(403).json({
          status: 'error',
          message: '你沒有權限進入此頁面'
        })
      }

      const user = await User.findByPk(userId)

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: '找不到使用者'
        })
      }

      const tweets = await Tweet.findAll({
        where: { UserId: userId },
        include: [User, Reply, Like, { model: User, as: 'LikedUsers' }],
        order: [['createdAt', 'DESC']]
      })

      if (tweets.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: '找不到任何推文'
        })
      }

      const tweetsData = tweets.map((tweet) => {
        const { id, UserId, description, createdAt } = tweet
        return {
          id,
          UserId,
          description,
          createdAt,
          avatar: tweet.User.avatar,
          name: tweet.User.name,
          account: tweet.User.account,
          repliedCount: tweet.Replies.length,
          likedCount: tweet.Likes.length,
          isLike: tweet.LikedUsers.some((u) => u.id === currentUserId)
        }
      })

      return res.status(200).json(tweetsData)
    } catch (err) {
      next(err)
    }
  },
  getUserReplies: async (req, res, next) => {
    try {
      const { userId } = req.params
      const currentUserId = helpers.getUser(req).id

      if (currentUserId !== Number(userId)) {
        return res.status(403).json({
          status: 'error',
          message: '你沒有權限進入此頁面'
        })
      }

      const user = await User.findByPk(userId)
      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: '找不到使用者'
        })
      }

      const replies = await Reply.findAll({
        where: { UserId: userId },
        include: [
          { model: User, attributes: ['name', 'avatar', 'account'] },
          {
            model: Tweet,
            include: User
          }
        ],
        order: [['createdAt', 'DESC']]
      })

      if (replies.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: '找不到任何回覆'
        })
      }

      const repliesData = replies.map((reply) => {
        return {
          id: reply.id,
          UserId: reply.UserId,
          comment: reply.comment,
          createdAt: reply.createdAt,
          name: reply.User.name,
          avatar: reply.User.avatar,
          account: reply.User.account,
          tweetId: reply.TweetId,
          tweetDescription: reply.Tweet.description,
          tweetCreatedAt: reply.Tweet.createdAt,
          tweetAuthorId: reply.Tweet.User.id,
          tweetAuthorAccount: reply.Tweet.User.account
        }
      })

      return res.status(200).json(repliesData)
    } catch (err) {
      next(err)
    }
  },
  addFollowing: async (req, res, next) => {
    try {
      const userId = req.body.id
      if (Number(userId) === helpers.getUser(req).id) {
        return res.status(400).json({ status: 'error', message: '無法追蹤自己' })
      }
      const [user, followship] = await Promise.all([
        User.findByPk(Number(userId)),
        Followship.findOne({
          where: {
            followingId: userId,
            followerId: helpers.getUser(req).id
          }
        })
      ])
      if (!user) {
        return res
          .status(404)
          .json({ status: 'error', message: '此帳戶不存在' })
      }
      if (followship) {
        return res
          .status(404)
          .json({ status: 'error', message: '你已追蹤此使用者!' })
      }
      await Followship.create({
        followingId: userId,
        followerId: helpers.getUser(req).id
      })
      return res.status(200).json({ status: 'success', message: '追蹤成功！' })
    } catch (error) { next(error) }
  },
  removeFollowing: async (req, res, next) => {
    try {
      const { followingId } = req.params
      if (Number(followingId) === helpers.getUser(req).id) {
        return res
          .status(400)
          .json({ status: 'error', message: '無法取消追蹤自己' })
      }
      const [user, followship] = await Promise.all([
        User.findByPk(Number(followingId)),
        Followship.findOne({
          where: {
            followerId: helpers.getUser(req).id,
            followingId
          }
        })
      ])
      if (!user) {
        return res
          .status(404)
          .json({ status: 'error', message: '此帳戶不存在' })
      }
      if (!followship) {
        return res
          .status(404)
          .json({ status: 'error', message: '你未追蹤此使用者!' })
      }
      await followship.destroy()
      return res.status(200).json({ status: 'success', message: '取消追蹤成功！' })
    } catch (error) { next(error) }
  },
  getUser: async (req, res, next) => {
    try {
      const { userId } = req.params
      let userInfo = await User.findByPk(userId, {
        attributes: { exclude: ['password', 'createdAt', 'updatedAt'] },
        include: [Tweet, { model: User, as: 'Followers' }, { model: User, as: 'Followings' }]
      })

      if (!userInfo || userInfo.role === 'admin') {
        return res
          .status(404)
          .json({ status: 'error', message: '此帳戶不存在' })
      }
      userInfo = {
        id: userInfo.id,
        account: userInfo.account,
        name: userInfo.name,
        avatar: userInfo.avatar || 'https://reurl.cc/7RVA5N',
        cover: userInfo.cover ||'https://reurl.cc/4QNDE3',
        introduction: userInfo.introduction ||'Newbie here!',
        tweetCount: userInfo.Tweets.length,
        followingCount: userInfo.Followings.length,
        followerCount: userInfo.Followers.length,
        isFollowing: userInfo.Followings.some(u => u.id === helpers.getUser(req).id)
      }

      return res.status(200).json(userInfo)
    } catch (error) { next(error) }
  }
}

module.exports = userController
