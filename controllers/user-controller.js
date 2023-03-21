const jwt = require('jsonwebtoken')

const { getUser } = require('../_helpers')

const userController = {
  signIn: async (req, res, next) => {
    try {
      const userData = getUser(req).toJSON()
      delete userData.password
      const token = jwt.sign(userData, process.env.JWT_SECRET, { expiresIn: '30d' })
      return res.json({
        status: 'success',
        data: {
          token,
          user: userData,
        },
      })
    } catch (err) {
      next(err)
    }
  },
}

module.exports = userController