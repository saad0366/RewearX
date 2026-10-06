const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const env = require('./env');
const authService = require('../services/authService');
const logger = require('../utils/logger');
const { stateStore } = require('../services/googleLoginService');

if (env.google.clientId && env.google.clientSecret) passport.use(
  new GoogleStrategy(
    {
      clientID: env.google.clientId,
      clientSecret: env.google.clientSecret,
      callbackURL: env.google.callbackUrl,
      state: true,
      store: stateStore,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const googleId = profile.id;
        const email = profile.emails?.[0]?.value;
        const name = profile.displayName;
        const avatar = profile.photos?.[0]?.value;

        if (!googleId || !email) {
          return done(new Error('Required Google profile information missing'), null);
        }

        const user = await authService.findOrCreateGoogleUser({
          googleId,
          email,
          name,
          avatar,
        });

        return done(null, user);
      } catch (error) {
        logger.warn('Google OAuth authentication failed.');
        return done(error, null);
      }
    }
  )
);

module.exports = passport;
