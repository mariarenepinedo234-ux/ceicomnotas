// SQL expressions use fixed internal aliases, never user input.
export const careerNameSql=(careerAlias,yearExpression)=>`COALESCE((SELECT cn.name FROM career_names cn WHERE cn.career_id=${careerAlias}.id AND cn.year_id=${yearExpression}),${careerAlias}.name)`;
